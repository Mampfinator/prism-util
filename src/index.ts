import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    Client,
    Colors,
    CommandInteraction,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    Events,
    GuildTextBasedChannel,
    IntentsBitField,
    MessageContextMenuCommandInteraction,
    PermissionsBitField,
    SlashCommandBuilder,
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
} from "./embeds";

const relayChannels = new Keyv(
    process.env.DB_PATH ?? `sqlite://${process.cwd()}/db.sqlite`,
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

        const relayChannelId = await relayChannels.get(command.guildId!);
        if (!relayChannelId) {
            return command.editReply({ embeds: [NOT_CONFIGURED_EMBED] });
        }

        const relayChannel = await client.channels.fetch(relayChannelId);
        if (!relayChannel || !relayChannel.isTextBased()) {
            return command.editReply({ embeds: [INTERNAL_ERROR_EMBED] });
        }

        const requestingMember = command.member;

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

        const message = await relayChannel.send({
            embeds: [
                new EmbedBuilder()
                    .setColor(Colors.Aqua)
                    .setAuthor({
                        name: `${requestingMember!.user.username}`,
                        iconURL: requestingMember?.avatar ?? undefined,
                    })
                    .setDescription(
                        `A user is requesting a pin in ${command.channel}.`,
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
        });

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

                    await response.update({
                        components: [],
                    });

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
                    await response.update({
                        components: [],
                    });

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
        interaction.commandName == "relay-channel"
    ) {
        const { guildId } = interaction;

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "get": {
                const channelId = await relayChannels.get(guildId!);
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
                await relayChannels.set(guildId!, channelId);

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
    }
});

const requestPinCommand = new ContextMenuCommandBuilder()
    .setDMPermission(false)
    .setName("Request Pin")
    .setType(ApplicationCommandType.Message);

const relayChannelCommand = new SlashCommandBuilder()
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .setName("relay-channel")
    .setDescription("Relay channel for pin requests.")
    .addSubcommand(set =>
        set
            .setName("set")
            .setDescription("Change the channel to send pin reqests to.")
            .addChannelOption(channel =>
                channel
                    .setName("channel")
                    .setDescription("The new channel.")
                    .setRequired(true),
            ),
    )
    .addSubcommand(get =>
        get
            .setName("get")
            .setDescription("Get the channel that's used for pin requests."),
    );

client.on(Events.ClientReady, async () => {
    const deployInGuild = process.env.DEBUG_GUILD_ID;

    for (const [id, command] of (
        await client.application!.commands.fetch()
    ).entries()) {
        console.log(`Deleting old command "${command.name}"`);
        await client.application!.commands.delete(id);
    }

    await client.application!.commands.create(requestPinCommand, deployInGuild);
    await client.application!.commands.create(
        relayChannelCommand,
        deployInGuild,
    );
});

client.login(process.env.DISCORD_TOKEN);
