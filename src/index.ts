import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Client,
    Colors,
    CommandInteraction,
    ComponentType,
    EmbedBuilder,
    Events,
    GuildChannel,
    GuildMember,
    GuildTextBasedChannel,
    IntentsBitField,
    MessageContextMenuCommandInteraction,
    PermissionFlagsBits,
    PermissionsBitField,
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
    PIN_REQUEST_DENIED_FEEDBACK,
    PIN_REQUEST_DENIED_MOD,
    PIN_REQUEST_DO_IT_YOURSELF,
    REQUEST_CHANNEL_COMMAND,
    REQUEST_PIN_COMMAND,
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

        const fields = [];

        const requestEmbed = new EmbedBuilder()
            .setColor(Colors.Aqua)
            .setDescription(
                `${requestingMember} is requesting a pin in ${command.channel}.`,
            );

        if (!!targetMessage.content && targetMessage.content.length > 0) {
            fields.push({
                name: "Message",
                value: targetMessage.content,
            });
        }

        if (!!targetMessage.stickers && targetMessage.stickers.size > 0) {
            fields.push({
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
            const attachments = [...targetMessage.attachments.values()].map(
                ({ url }) => url,
            );

            requestEmbed.setImage(attachments.shift() ?? null);

            if (targetMessage.attachments.size > 1) {
                fields.push({
                    name: "Other Attachments",
                    value: [...attachments.values()]
                        .map(
                            (attachment, index) =>
                                `[Attachment (${index + 1})](${attachment})`,
                        )
                        .join("\n"),
                    inline: true,
                });
            }
        }

        fields.push({
            name: "\u200b",
            value: `[Jump](${targetMessage.url})`,
        });

        const requestMessagePayload = {
            embeds: [
                requestEmbed
                    .setAuthor({
                        name: `${requestingMember.displayName} (@${requestingMember.user.username})`,
                        iconURL: requestingMember.displayAvatarURL(),
                    })
                    .addFields(...fields),
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

        const requestMessage = await requestChannel.send(requestMessagePayload);

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
            console.log(embed);

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

        let acted = false;

        cancellationCollector.on("end", async collected => {
            const response = collected.first();
            if (!response) return;
            if (response.customId != "request-pin-cancel") return;

            if (acted) return;
            acted = true;

            await response.update({ embeds: [PIN_REQUEST_CANCELLED], components: [] });

            requestMessagePayload.components = [];
            requestMessagePayload.embeds[0]!.setDescription(
                `❌ Pin request by ${requestingMember} has been cancelled.`,
            ).setColor(Colors.Red);

            await requestMessage.edit(requestMessagePayload);
        });

        const modCollector = requestMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            max: 1,
        });

        modCollector.on("end", async collected => {
            const response = collected.first();
            if (!response) {
                return; // this shouldn't ever happen. But it might, because jank!
            }

            if (acted) return;
            acted = true;

            await requestedMessage.edit({ components: [] });

            switch (response.customId) {
                case "request-pin-approve":
                    await targetMessage.pin();

                    requestMessagePayload.components = [];
                    requestMessagePayload
                        .embeds![0]!.setDescription(
                            `✅ Pin request by ${requestingMember} has been approved by ${response.member}`,
                        )
                        .setColor(Colors.Green);

                    await response.update(requestMessagePayload);

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
                    requestMessagePayload.components = [];
                    requestMessagePayload
                        .embeds![0]!.setDescription(
                            `❌ Pin request by ${requestingMember} has been denied by ${response.member}`,
                        )
                        .setColor(Colors.Red);

                    await response.update(requestMessagePayload);

                    await Promise.all([
                        response.followUp({
                            embeds: [PIN_REQUEST_DENIED_MOD],
                            ephemeral: true,
                        }),
                        command.followUp({
                            embeds: [PIN_REQUEST_DENIED_FEEDBACK],
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
