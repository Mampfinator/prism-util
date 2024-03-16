import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ChatInputCommandInteraction,
    Colors,
    ComponentType,
    EmbedBuilder,
    PermissionsBitField,
    SlashCommandBuilder,
    Snowflake,
} from "discord.js";

export const CONFIG_COMMAND = {
    type: "SlashCommand" as const,
    builder: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Config commands")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(requestChannel =>
            requestChannel
                .setName("request-channel")
                .setDescription("Configure the channel to send pin requests to.")
                .addChannelOption(channel =>
                    channel
                        .setName("channel")
                        .setDescription("The channel to send pin requests to.")
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText),
                ),
        )
        .addSubcommand(copaImport =>
            copaImport
                .setName("copa-import")
                .setDescription("Import custom roles from Copa.")
                .addRoleOption(anchor =>
                    anchor
                        .setName("anchor")
                        .setDescription("The anchor role as configured in Copa.")
                        .setRequired(true),
                )
                .addRoleOption(stopBefore =>
                    stopBefore
                        .setName("stop-before")
                        .setDescription(
                            "The role after the last custom role. Ignore if the last role in the menu is a custom role.",
                        )
                        .setRequired(false),
                ),
        ) as SlashCommandBuilder,
    execute: async (interaction: ChatInputCommandInteraction) => {
        const subcommand = interaction.options.getSubcommand(true) as
            | "request-channel"
            | "copa-import";

        if (subcommand == "request-channel") {
            const channel = interaction.options.getChannel("channel", false);

            if (!channel) {
                const setChannel = await interaction.client.requestChannels
                    .get(interaction.guildId!)
                    .catch(() => {});

                if (!!setChannel) {
                    return interaction.reply({
                        content: `Requests are being sent to <#${setChannel}>`,
                        ephemeral: true,
                    });
                }

                return interaction.reply({
                    content: "No channel set!",
                    ephemeral: true,
                });
            }

            const { id: channelId } = channel;

            await interaction.client.requestChannels.set(interaction.guildId!, channelId);

            interaction.reply({
                content: `Requests will now be sent to <#${channelId}>`,
                ephemeral: true,
            });
        } else if (subcommand == "copa-import") {
            const anchor = interaction.options.getRole("anchor", true);
            const stopBefore = interaction.options.getRole("stop-before", false);

            const ignore = new Set();
            const migrate = new Map();

            for (const role of await interaction
                .guild!.roles.fetch()
                .then(roles => roles.values())) {
                if (
                    role.position < anchor.position ||
                    (!!stopBefore && role.position >= stopBefore.position)
                ) {
                    continue;
                }

                // custom roles are supposed to have *exactly* 1 member.
                if (role.members.size != 1) {
                    ignore.add(role.id);
                    continue;
                }

                const member = role.members.first()!;

                migrate.set(role.id, member.id);
            }

            const reply = await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Blue)
                        .setDescription("Applying the following changes:")
                        .addFields(
                            {
                                name: "Ignoring roles",
                                value:
                                    ignore.size > 0
                                        ? Array.from(ignore)
                                              .map(id => `<@&${id}>`)
                                              .join("\n")
                                        : "None",
                            },
                            {
                                name: "Migrating roles",
                                value:
                                    migrate.size > 0
                                        ? Array.from(migrate)
                                              .map(
                                                  ([roleId, memberId]) =>
                                                      `<@${memberId}>: <@&${roleId}>`,
                                              )
                                              .join("\n")
                                        : "None",
                            },
                        ),
                ],
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Success)
                            .setLabel("Confirm")
                            .setCustomId("confirm"),
                    ),
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder()
                            .setStyle(ButtonStyle.Danger)
                            .setLabel("Cancel")
                            .setCustomId("cancel"),
                    ),
                ],
                fetchReply: true,
            });

            const answer = await reply
                .awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 10000,
                })
                .then(c => c.customId as "confirm" | "cancel");

            await interaction.editReply({ components: [] });

            if (answer == "cancel") {
                await interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription("Cancelled migration"),
                    ],
                    ephemeral: true,
                });
                return;
            }

            const failed: [Snowflake, Snowflake][] = [];

            for (const [roleId, memberId] of migrate) {
                await interaction.client.customRoles
                    .set(`${interaction.guildId}:${memberId}`, roleId)
                    .catch(() => failed.push([roleId, memberId]));
            }

            if (failed.length > 0) {
                await interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Red)
                            .setDescription(`Failed to migrate ${failed.length} roles`)
                            .addFields({
                                name: "Roles",
                                value: failed
                                    .map(([roleId, memberId]) => `<@${memberId}>: <@&${roleId}>`)
                                    .join("\n"),
                            }),
                    ],
                    ephemeral: true,
                });
            } else {
                await interaction.followUp({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Green)
                            .setDescription("Successfully migrated roles"),
                    ],
                    ephemeral: true,
                });
            }
        }
    },
};
