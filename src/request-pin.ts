import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    ComponentType,
    ContextMenuCommandBuilder,
    DiscordAPIError,
    EmbedBuilder,
    GuildChannel,
    GuildMember,
    GuildTextBasedChannel,
    MessageContextMenuCommandInteraction,
    ModalBuilder,
    PermissionFlagsBits,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { INTERNAL_ERROR, MISSING_PERMISSIONS, NOT_CONFIGURED } from "./constants";

export const PIN_REQUEST_ALREADY_PINNED = new EmbedBuilder()
    .setDescription(":x: This message is already pinned, silly!")
    .setColor(Colors.Red);

export const PIN_REQUEST_DO_IT_YOURSELF = new EmbedBuilder()
    .setDescription(":x: Just pin it yourself, stoobid.")
    .setColor(Colors.Red);

export const PIN_REQUESTED = new EmbedBuilder()
    .setDescription(
        ":white_check_mark: Your request has been sent to the mods! Please be patient while they have a look. :coffee:",
    )
    .setColor(Colors.Green);

export const PIN_REQUEST_CANCELLED = new EmbedBuilder()
    .setDescription(":x: Your pin request was cancelled!")
    .setColor(Colors.Red);

export const PIN_REQUEST_APPROVED_FEEDBACK = new EmbedBuilder()
    .setDescription(":white_check_mark: Your pin request has been approved!")
    .setColor(Colors.Green);
export const PIN_REQUEST_APPROVED_MOD = new EmbedBuilder()
    .setDescription(":white_check_mark: Pin approved!")
    .setColor(Colors.Green);

export function makeRequestDeniedFeedback(reason?: string): EmbedBuilder {
    if (reason && reason.length > 0) {
        return new EmbedBuilder(structuredClone(PIN_REQUEST_DENIED_FEEDBACK.data)).addFields({
            name: "Reason",
            value: reason,
        });
    } else {
        return PIN_REQUEST_DENIED_FEEDBACK;
    }
}

export const PIN_REQUEST_DENIED_FEEDBACK = new EmbedBuilder()
    .setDescription(":x: Your pin request has been denied!")
    .setColor(Colors.Red);
export const PIN_REQUEST_DENIED_MOD = new EmbedBuilder()
    .setDescription(":x: Pin denied!")
    .setColor(Colors.Red);

export const REQUEST_PIN_COMMAND = {
    type: "MessageContextMenuCommand" as const,
    builder: new ContextMenuCommandBuilder()
        .setDMPermission(false)
        .setName("Request Pin")
        .setType(ApplicationCommandType.Message),
    execute: async (command: MessageContextMenuCommandInteraction) => {
        await command.deferReply({ ephemeral: true });

        const channel = command.channel as GuildTextBasedChannel;

        if (
            !channel
                .permissionsFor(command.client.user!.id)
                ?.has(PermissionsBitField.Flags.ManageMessages)
        ) {
            return command.editReply({ embeds: [MISSING_PERMISSIONS] });
        }

        const requestChannelId = await command.client.requestChannels.get(command.guildId!);
        if (!requestChannelId) {
            return command.editReply({ embeds: [NOT_CONFIGURED] });
        }

        const requestChannel = await command.client.channels.fetch(requestChannelId);
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
            .setDescription(`${requestingMember} is requesting a pin in ${command.channel}.`);

        if (!!targetMessage.content && targetMessage.content.length > 0) {
            requestEmbed.addFields({
                name: "Message",
                value: `Message from <@${targetMessage.author.id}>: ${targetMessage.content}`,
            });
        }

        if (!!targetMessage.stickers && targetMessage.stickers.size > 0) {
            requestEmbed.addFields({
                name: "Stickers",
                value: [
                    ...targetMessage.stickers.mapValues(sticker => `\`sticker.name\``).values(),
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

        const cancellationCollector = requestedMessage.createMessageComponentCollector({
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
                if (!(error instanceof DiscordAPIError) || Number(error.code) == 10008) throw error;
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
                if (!(error instanceof DiscordAPIError) || Number(error.code) == 10008) throw error;
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
                    throw new Error(`Unknown component ID in pin response: ${response.customId}.`);
            }
        });
    },
};
