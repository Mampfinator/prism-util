import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    Colors,
    CommandInteraction,
    ComponentType,
    DiscordAPIError,
    EmbedBuilder,
    Events,
    GuildChannel,
    GuildMember,
    GuildTextBasedChannel,
    IntentsBitField,
    MessageContextMenuCommandInteraction,
    ModalBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import "dotenv/config";
import Keyv from "keyv";
import {
    INTERNAL_ERROR,
    MISSING_PERMISSIONS,
    NOT_CONFIGURED,
    PIN_REQUESTED,
    PIN_REQUEST_ALREADY_PINNED,
    PIN_REQUEST_APPROVED_FEEDBACK,
    PIN_REQUEST_APPROVED_MOD,
    PIN_REQUEST_CANCELLED,
    PIN_REQUEST_DENIED_MOD,
    PIN_REQUEST_DO_IT_YOURSELF,
    REQUEST_CHANNEL_COMMAND,
    REQUEST_PIN_COMMAND,
    makeRequestDeniedFeedback,
} from "./constants";

const requestChannels = new Keyv(
    process.env.DB_PATH ?? `sqlite://${process.cwd()}/db.sqlite`,
    {
        namespace: "request-channel",
    },
);

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.MessageContent,
    ],
});

async function handleMessageContextMenuCommand(
    command: MessageContextMenuCommandInteraction,
) {
    if (command.commandName == "Request Pin") {
        await command.deferReply({ ephemeral: true });

        const channel = command.channel as GuildTextBasedChannel;

        if (
            !channel
                .permissionsFor(client.user!.id)
                ?.has(PermissionsBitField.Flags.ManageMessages)
        ) {
            return command.editReply({ embeds: [MISSING_PERMISSIONS] });
        }

        const requestChannelId = await requestChannels.get(command.guildId!);
        if (!requestChannelId) {
            return command.editReply({ embeds: [NOT_CONFIGURED] });
        }

        const requestChannel = await client.channels.fetch(requestChannelId);
        if (!requestChannel || !requestChannel.isTextBased()) {
            return command.editReply({ embeds: [INTERNAL_ERROR] });
        }

        const { targetMessage } = command;

        if (targetMessage.pinned) {
            return command.editReply({
                embeds: [PIN_REQUEST_ALREADY_PINNED],
            });
        }

        /**
         * Member that requested the pin.
         */
        const requestingMember = command.member! as GuildMember;
        if (
            process.env.NODE_ENV == "production" &&
            (command.channel as GuildChannel)
                .permissionsFor(requestingMember)
                .has(PermissionFlagsBits.ManageMessages)
        ) {
            return command.editReply({
                embeds: [PIN_REQUEST_DO_IT_YOURSELF],
            });
        }

        /**
         * Embed that is presented to the mods.
         * Its message also contains the Approve/Deny buttons before the request is acted upon.
         */
        const requestEmbed = new EmbedBuilder()
            .setColor(Colors.Aqua)
            .setDescription(
                `${requestingMember} is requesting a pin in ${command.channel}.`,
            );

        if (!!targetMessage.content && targetMessage.content.length > 0) {
            requestEmbed.addFields({
                name: "Message",
                value: targetMessage.content,
            });
        }

        if (!!targetMessage.stickers && targetMessage.stickers.size > 0) {
            requestEmbed.addFields({
                name: "Stickers",
                value: [
                    ...targetMessage.stickers
                        .mapValues(sticker => `\`sticker.name\``)
                        .values(),
                ].join("\n"),
                inline: true,
            });
        }

        if (targetMessage.attachments?.size > 0) {
            const attachments = [...targetMessage.attachments.values()];

            requestEmbed.setImage(attachments.shift()?.url ?? null);

            if (targetMessage.attachments.size > 1) {
                requestEmbed.addFields({
                    name: "Other Attachments",
                    value: [...attachments.values()]
                        .map(({ url, name }, index) => `[${name}](${url})`)
                        .join("\n"),
                    inline: true,
                });
            }
        }

        requestEmbed.addFields({
            name: "\u200b",
            value: `[Jump](${targetMessage.url})`,
        });

        const requestMessagePayload = {
            embeds: [
                requestEmbed.setAuthor({
                    name: `${requestingMember.displayName} (@${requestingMember.user.username})`,
                    iconURL: requestingMember.displayAvatarURL(),
                }),
            ],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Success)
                        .setLabel("Approve")
                        .setEmoji("✅")
                        .setCustomId("request-pin-approve"),
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Deny")
                        .setEmoji("❌")
                        .setCustomId("request-pin-deny"),
                ),
            ],
        };

        /**
         * Mod-facing message.
         */
        const requestMessage = await requestChannel.send(requestMessagePayload);

        /**
         * User-facing context menu response.
         */
        const requestedMessage = await command.editReply({
            embeds: [PIN_REQUESTED],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Danger)
                        .setLabel("Cancel")
                        .setEmoji("❌")
                        .setCustomId("request-pin-cancel"),
                ),
            ],
        });

        for (const embed of targetMessage.embeds) {
            const newEmbed = {
                ...embed.data,
                video: undefined,
                provider: undefined,
            };

            if (!newEmbed.image && embed.thumbnail) {
                newEmbed.image = embed.thumbnail;
            }

            await requestMessage.reply({
                embeds: [newEmbed],
                allowedMentions: {
                    users: [],
                    roles: [],
                },
            });
        }

        const cancellationCollector =
            requestedMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                maxComponents: 1,
            });

        /**
         * Whether either party (requesting user, mods) has acted on this request (cancelled/approved/denied).
         * This prevents a potential rare (but possible) race condition where the client receives button interactions from both
         * sides at once.
         */
        let acted = false;

        cancellationCollector.on("end", async collected => {
            const response = collected.first();
            if (!response) return;
            if (response.customId != "request-pin-cancel") return;

            if (acted) return;
            acted = true;

            try {
                await response.update({
                    embeds: [PIN_REQUEST_CANCELLED],
                    components: [],
                });
                // We don't want to present mods the Approve/Deny options anymore, and notify them that the user has cancelled the request.
                await requestMessage.edit({
                    components: [],
                    embeds: [
                        new EmbedBuilder(requestEmbed.data)
                            .setDescription(
                                `❌ Pin request by ${requestingMember} has been cancelled.`,
                            )
                            .setColor(Colors.Red),
                    ],
                });
            } catch (error) {
                if (
                    !(error instanceof DiscordAPIError) ||
                    Number(error.code) == 10008
                )
                    throw error;
            }
        });

        const modCollector = requestMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            max: 1,
        });

        modCollector.on("end", async collected => {
            const response = collected.first();
            if (!response) return;

            if (acted) return;
            acted = true;

            // remove user-facing options so they can't cancel anymore.
            try {
                await command.editReply({ components: [] });
            } catch (error) {
                if (
                    !(error instanceof DiscordAPIError) ||
                    Number(error.code) == 10008
                )
                    throw error;
            }

            switch (response.customId) {
                case "request-pin-approve":
                    await targetMessage.pin();

                    await response.update({
                        components: [],
                        embeds: [
                            new EmbedBuilder(requestEmbed.data)
                                .setDescription(
                                    `✅ Pin request by ${requestingMember} has been approved by ${response.member}`,
                                )
                                .setColor(Colors.Green),
                        ],
                    });

                    await Promise.all([
                        response.followUp({
                            embeds: [PIN_REQUEST_APPROVED_MOD],
                            ephemeral: true,
                        }),
                        command.followUp({
                            embeds: [PIN_REQUEST_APPROVED_FEEDBACK],
                            ephemeral: true,
                        }),
                    ]);

                    break;
                case "request-pin-deny":
                    await response.showModal(
                        new ModalBuilder()
                            .setCustomId("reason-modal")
                            .setTitle("Reason")
                            .addComponents(
                                new ActionRowBuilder<TextInputBuilder>().addComponents(
                                    new TextInputBuilder()
                                        .setLabel("Reason")
                                        .setStyle(TextInputStyle.Paragraph)
                                        .setCustomId("reason")
                                        .setPlaceholder(
                                            "Enter your reason for denying this request here. Leave blank for no reason.",
                                        )
                                        .setRequired(false),
                                ),
                            ),
                    );

                    const modalResponse = await response.awaitModalSubmit({
                        time: 2 * 60 * 1000, // 2 minutes are *definitely* enough to type up a reason.
                    });

                    modalResponse.deferUpdate();

                    const reason =
                        modalResponse.fields
                            .getField("reason", ComponentType.TextInput)
                            ?.value?.trim() ?? "";

                    const responseEmbed = new EmbedBuilder(requestEmbed.data)
                        .setDescription(
                            `❌ Pin request by ${requestingMember} has been denied by ${response.member}`,
                        )
                        .setColor(Colors.Red);

                    if (reason.length > 0) {
                        responseEmbed.addFields({
                            name: "Reason",
                            value: reason,
                        });
                    }

                    await response.editReply({
                        components: [],
                        embeds: [responseEmbed],
                    });

                    await Promise.all([
                        response.followUp({
                            embeds: [PIN_REQUEST_DENIED_MOD],
                            ephemeral: true,
                        }),
                        command.followUp({
                            embeds: [makeRequestDeniedFeedback(reason)],
                            ephemeral: true,
                        }),
                    ]);

                    break;
                default:
                    throw new Error(
                        `Unknown component ID in pin response: ${response.customId}.`,
                    );
            }
        });
    }
}

async function handleSlashCommandInteraction(interaction: CommandInteraction) {
    if (
        interaction.isChatInputCommand() &&
        interaction.commandName == "request-channel"
    ) {
        const { guildId } = interaction;

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "get": {
                const channelId = await requestChannels.get(guildId!);
                if (!!channelId) {
                    return interaction.reply({
                        content: `<#${channelId}>`,
                        ephemeral: true,
                    });
                } else {
                    return interaction.reply({
                        content: "No channel set!",
                        ephemeral: true,
                    });
                }
            }
            case "set": {
                const { id: channelId } = interaction.options.getChannel(
                    "channel",
                    true,
                );
                await requestChannels.set(guildId!, channelId);

                return interaction.reply({
                    content: `Relay channel set to <#${channelId}>.`,
                    ephemeral: true,
                });
            }
        }
    }
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isMessageContextMenuCommand()) {
            await handleMessageContextMenuCommand(interaction);
        } else if (interaction.isCommand()) {
            await handleSlashCommandInteraction(interaction);
        }
    } catch (error) {
        console.error(error);

        try {
            if (interaction.isRepliable()) {
                const errorReply = {
                    ephemeral: true,
                    embeds: [INTERNAL_ERROR],
                };
                if (interaction.replied) {
                    interaction.followUp(errorReply);
                } else {
                    interaction.reply(errorReply);
                }
            }
        } catch (error) {
            console.error(
                "Error while attempting to respond with an internal error: ",
                error,
            );
        }
    }
});

client.on(Events.ClientReady, async () => {
    const deployInGuild = process.env.DEBUG_GUILD_ID;

    for (const [id, command] of (
        await client.application!.commands.fetch()
    ).entries()) {
        console.log(`Deleting old command "${command.name}"`);
        await client.application!.commands.delete(id);
    }

    await client.application!.commands.create(
        REQUEST_PIN_COMMAND,
        deployInGuild,
    );
    await client.application!.commands.create(
        REQUEST_CHANNEL_COMMAND,
        deployInGuild,
    );

    console.log(`Logged in as ${client.user!.displayName}`);
});

client.login(process.env.DISCORD_TOKEN);
