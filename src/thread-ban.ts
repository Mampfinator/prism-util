import {
    AnyThreadChannel,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    Colors,
    EmbedBuilder,
    Events,
    SlashCommandBuilder,
    Snowflake,
} from "discord.js";

const THREAD_REMOVED_REASON = "User is banned from this thread.";

const THREAD_NOT_SPECIFIED = new EmbedBuilder()
    .setDescription(
        `No thread specified!\nIf you omitted the \`thread\` option, make sure you used the command in a thread!`,
    )
    .setColor(Colors.Red);

export const THREAD_BAN_COMMAND = {
    type: "SlashCommand" as const,
    builder: new SlashCommandBuilder()
        .setName("thread-ban")
        .setDescription("Manage thread bans in this thread.")
        .addSubcommand(ban =>
            ban
                .setName("ban")
                .setDescription("Ban a user from this thread.")
                .addUserOption(user =>
                    user.setName("user").setDescription("User to ban.").setRequired(true),
                )
                .addChannelOption(thread =>
                    thread
                        .setName("thread")
                        .setDescription(
                            "Thread to ban the user from. If not specified, defaults to current thread.",
                        )
                        .addChannelTypes(
                            ChannelType.PublicThread |
                                ChannelType.PrivateThread |
                                ChannelType.AnnouncementThread,
                        ),
                ),
        )
        .addSubcommand(lift =>
            lift
                .setName("lift")
                .setDescription("Lift a thread ban for a user.")
                .addUserOption(user =>
                    user
                        .setName("user")
                        .setDescription("User to lift the ban for.")
                        .setRequired(true),
                )
                .addChannelOption(thread =>
                    thread
                        .setName("thread")
                        .setDescription(
                            "Thread to lift the ban from. If not specified, defaults to current thread.",
                        )
                        .addChannelTypes(
                            ChannelType.PublicThread |
                                ChannelType.PrivateThread |
                                ChannelType.AnnouncementThread,
                        ),
                ),
        )
        .addSubcommand(forget =>
            forget
                .setName("forget")
                .setDescription("Reset all thread bans for a thread.")
                .addChannelOption(thread =>
                    thread
                        .setName("thread")
                        .setDescription(
                            "Thread to lift the bans from. If not specified, defaults to current thread.",
                        )
                        .addChannelTypes(
                            ChannelType.PublicThread |
                                ChannelType.PrivateThread |
                                ChannelType.AnnouncementThread,
                        ),
                ),
        )
        .addSubcommand(list =>
            list
                .setName("list")
                .setDescription("List thread bans for a thread.")
                .addChannelOption(thread =>
                    thread
                        .setName("thread")
                        .setDescription(
                            "Thread to list thread bans of. If not specified, defaults to current thread.",
                        )
                        .addChannelTypes(
                            ChannelType.PublicThread |
                                ChannelType.PrivateThread |
                                ChannelType.AnnouncementThread,
                        ),
                ),
        ) as SlashCommandBuilder,
    init: (client: Client) => {
        client.on(Events.ThreadMembersUpdate, async (added, _, thread) => {
            if (added.size <= 0) return;
            if (!thread.manageable) return;

            const bannedList: Snowflake[] = await thread.client.threadBans
                .get(thread.id)
                .catch(() => {});

            if (!bannedList || bannedList.length == 0) return;
            const deniedUsers = new Set(bannedList);

            for (const [id, member] of added.entries()) {
                if (!deniedUsers.has(id)) return;

                await member.remove(THREAD_REMOVED_REASON);

                const user = member.user ?? (await client.users.fetch(member.id));

                await user.send({
                    embeds: [
                        new EmbedBuilder().setColor(Colors.Red).setDescription(
                            `
                                You have been removed from <#${thread.id}> (${thread.name}) in ${thread.guild.name} because you're banned from viewing this thread!
                                This likely means somebody wants to keep the contents of said thread a secret from you.
                                If you believe this to be a mistake, contact the moderators!
                            `.trim(),
                        ),
                    ],
                });
            }
        });
    },
    execute: async (interaction: ChatInputCommandInteraction) => {
        const command = interaction.options.getSubcommand(true) as
            | "ban"
            | "lift"
            | "forget"
            | "list";

        let thread = interaction.options.getChannel("thread") as AnyThreadChannel | null;

        if (!thread) {
            if (!interaction.channel?.isThread())
                return await interaction.reply({
                    embeds: [THREAD_NOT_SPECIFIED],
                });

            thread = interaction.channel;
        }

        if (command == "forget") {
            await interaction.client.threadBans.delete(thread.id);

            return await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setDescription(`All bans from this thread have been lifted.`),
                ],
            });
        }

        const threadBans: Set<Snowflake> = await interaction.client.threadBans
            .get(thread.id)
            .then(bans => (bans ? new Set<string>(bans) : new Set<string>()))
            .catch(() => new Set<string>());

        if (command == "list") {
            const embed = new EmbedBuilder()
                .setTitle(`Listing thread bans for ${thread.name}`)
                .setColor(Colors.Aqua);

            if (threadBans.size > 0) {
                embed.setDescription([...threadBans.values()].map(id => `- ${id}`).join("\n"));
            } else {
                embed.setDescription("No users are banned in this thread.");
            }

            return await interaction.reply({
                embeds: [embed],
            });
        }

        const user = interaction.options.getUser("user", true);

        const banned = threadBans.has(user.id);

        if (command == "ban") {
            if (banned)
                return await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Aqua)
                            .setDescription(
                                `<@${user.id}> is already banned from <#${thread.id}>.`,
                            ),
                    ],
                });

            threadBans.add(user.id);

            const threadMember = await thread.members
                .fetch({
                    member: user.id,
                })
                .catch(() => {});

            if (threadMember) {
                await threadMember.remove(THREAD_REMOVED_REASON);
            }

            return await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setDescription(`<@${user.id}> has been banned from <#${thread.id}>.`),
                ],
            });
        } else if (command == "lift") {
            if (!banned)
                return await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Aqua)
                            .setDescription(
                                `<@${user.id}> wasn't banned from <#${thread.id}>, so no action taken.`,
                            ),
                    ],
                });

            threadBans.delete(user.id);
            await interaction.client.threadBans.set(thread.id, [...threadBans]);

            return await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Green)
                        .setDescription(
                            `<@${user.id}>'s ban has been lifted from <#${thread.id}>.`,
                        ),
                ],
            });
        }
    },
};
