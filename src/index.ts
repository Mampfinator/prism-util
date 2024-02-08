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
    GuildMember,
    GuildTextBasedChannel,
    IntentsBitField,
    MessageContextMenuCommandInteraction,
    PermissionsBitField,
} from "discord.js";
import "dotenv/config";
import Keyv from "keyv";
import {
    INTERNAL_ERROR_EMBED,
    MISSING_PERMISSIONS_EMBED,
    NOT_CONFIGURED_EMBED,
    PIN_REQUESTED_EMBED,
    PIN_REQUEST_ALREADY_PINNED_EMBED,
    PIN_REQUEST_APPROVED_FEEDBACK_EMBED,
    PIN_REQUEST_APPROVED_MOD_EMBED,
    PIN_REQUEST_DENIED_FEEDBACK_EMBED,
    PIN_REQUEST_DENIED_MOD_EMBED,
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
            return command.editReply({ embeds: [MISSING_PERMISSIONS_EMBED] });
        }

        const requestChannelId = await requestChannels.get(command.guildId!);
        if (!requestChannelId) {
            return command.editReply({ embeds: [NOT_CONFIGURED_EMBED] });
        }

        const requestChannel = await client.channels.fetch(requestChannelId);
        if (!requestChannel || !requestChannel.isTextBased()) {
            return command.editReply({ embeds: [INTERNAL_ERROR_EMBED] });
        }

        const requestingMember = command.member! as GuildMember;

        const fields = [];

        const { targetMessage } = command;

        if (targetMessage.pinned) {
            return command.editReply({
                embeds: [PIN_REQUEST_ALREADY_PINNED_EMBED],
            });
        }

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

        if (!!targetMessage.attachments && targetMessage.attachments.size > 0) {
            fields.push({
                name: "Attachments",
                value: [...targetMessage.attachments.values()]
                    .map(
                        (attachment, index) =>
                            `[Attachment (${index + 1})](${attachment.url})`,
                    )
                    .join("\n"),
                inline: true,
            });
        }

        fields.push({
            name: "\u200b",
            value: `[Jump](${targetMessage.url})`,
        });

        const requestMessage = {
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Aqua)
                    .setAuthor({
                        name: `${requestingMember.displayName} (@${requestingMember.user.username})`,
                        iconURL: requestingMember.displayAvatarURL(),
                    })
                    .setDescription(
                        `${requestingMember} is requesting a pin in ${command.channel}.`,
                    )
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

        const message = await requestChannel.send(requestMessage);

        await command.editReply({ embeds: [PIN_REQUESTED_EMBED] });

        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            max: 1,
        });

        collector.on("end", async collected => {
            const response = collected.first();
            if (!response) {
                return; // this shouldn't ever happen. But it might, because jank!
            }

            switch (response.customId) {
                case "request-pin-approve":
                    await targetMessage.pin();

                    requestMessage.components = [];
                    requestMessage
                        .embeds![0]!.setDescription(
                            `✅ Pin request by ${requestingMember} has been approved by ${response.member}`,
                        )
                        .setColor(Colors.Green);

                    await response.update(requestMessage);

                    await Promise.all([
                        response.followUp({
                            embeds: [PIN_REQUEST_APPROVED_MOD_EMBED],
                            ephemeral: true,
                        }),
                        command.followUp({
                            embeds: [PIN_REQUEST_APPROVED_FEEDBACK_EMBED],
                            ephemeral: true,
                        }),
                    ]);

                    break;
                case "request-pin-deny":
                    requestMessage.components = [];
                    requestMessage
                        .embeds![0]!.setDescription(
                            `❌ Pin request by ${requestingMember} has been denied by ${response.member}`,
                        )
                        .setColor(Colors.Red);

                    await response.update(requestMessage);

                    await Promise.all([
                        response.followUp({
                            embeds: [PIN_REQUEST_DENIED_MOD_EMBED],
                            ephemeral: true,
                        }),
                        command.followUp({
                            embeds: [PIN_REQUEST_DENIED_FEEDBACK_EMBED],
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
                    embeds: [INTERNAL_ERROR_EMBED],
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
