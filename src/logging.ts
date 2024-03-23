import {
    AttachmentBuilder,
    ChannelType,
    ChatInputCommandInteraction,
    Client,
    Collection,
    Colors,
    EmbedBuilder,
    Events,
    GuildChannel,
    GuildMember,
    GuildTextBasedChannel,
    Message,
    MessageCreateOptions,
    PartialMessage,
    PermissionsBitField,
    SlashCommandBuilder,
    Snowflake,
} from "discord.js";
import { pluralize, asymmetricDiff } from "./util";
import Keyv from "keyv";

export class IgnoreChannels {
    private readonly db: Keyv;

    constructor(dbPath: string) {
        this.db = new Keyv(dbPath, { namespace: "ignore-channels" });
    }

    public async shouldIgnore(channel: GuildChannel): Promise<boolean> {
        const ignoreChannels = await this.db
            .get(channel.guildId!)
            .then(str => (str ? new Set(JSON.parse(str)) : undefined));

        if (!ignoreChannels) return false;

        return ignoreChannels.has(channel.id) || ignoreChannels.has(channel.parentId!);
    }

    public async ignore(channel: GuildChannel) {
        const ignoreChannels = await this.list(channel.guildId);

        console.log(ignoreChannels);

        if (!ignoreChannels) {
            await this.save(channel.guildId, new Set([channel.id]));
        } else {
            ignoreChannels.add(channel.id);
            await this.save(channel.guildId, ignoreChannels);
        }
    }

    /**
     * Unignore a channel. Returns whether the channel was ignored in the first place.
     */
    public async unignore(channel: GuildChannel): Promise<boolean> {
        const ignoreChannels = await this.list(channel.id);

        if (!ignoreChannels) return false;

        const ignored = ignoreChannels.delete(channel.id);

        if (ignored) {
            await this.save(channel.guildId, ignoreChannels);
        }

        return ignored;
    }

    public async list(guildId: Snowflake): Promise<Set<Snowflake> | undefined> {
        let raw = await this.db.get(guildId);

        console.log(raw);

        if (!raw) return undefined;

        if (!Array.isArray(raw)) raw = JSON.parse(raw);

        return new Set(raw);
    }

    private async save(guildId: Snowflake, ignoreChannels: Set<Snowflake>) {
        await this.db.set(guildId, JSON.stringify([...ignoreChannels]));
    }
}

export const LOGGING_COMMAND = {
    type: "SlashCommand" as const,
    builder: new SlashCommandBuilder()
        .setName("logging")
        .setDescription("Configure logging for the bot.")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(channel =>
            channel
                .setName("channel")
                .setDescription("Configure the channel to log messages to.")
                .addChannelOption(channel =>
                    channel
                        .setName("channel")
                        .setDescription(
                            "The channel to log messages to. If not set, tells you the currently configured channel.",
                        )
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText),
                ),
        )
        .addSubcommand(disable =>
            disable.setName("disable").setDescription("Disable logging for the bot."),
        )
        .addSubcommandGroup(ignore =>
            ignore
                .setName("ignore")
                .setDescription("Configure ignore lists.")
                .addSubcommand(list => list.setName("list").setDescription("List ignore settings."))
                .addSubcommand(reset =>
                    reset.setName("reset").setDescription("Reset ignore settings."),
                )
                .addSubcommand(unignore =>
                    unignore
                        .setName("unignore")
                        .setDescription("Unignore a channel.")
                        .addChannelOption(channel =>
                            channel
                                .setName("channel")
                                .setDescription(
                                    "The channel to unignore. If omitted, unignores the current channel.",
                                )
                                .setRequired(true),
                        ),
                )
                .addSubcommand(ignore =>
                    ignore
                        .setName("ignore")
                        .setDescription("Ignore a single channel.")
                        .addChannelOption(channel =>
                            channel
                                .setName("channel")
                                .setDescription(
                                    "The channel to ignore. If omitted, ignores the current channel.",
                                )
                                .setRequired(false),
                        ),
                ),
        ),
    init(client: Client) {
        console.log("Initializing logging command.");

        client.on(Events.MessageDelete, handleMessageDelete);
        client.on(Events.MessageUpdate, handleMessageUpdate);
        client.on(Events.MessageBulkDelete, handleMessageBulkDelete);
    },
    execute: async (interaction: ChatInputCommandInteraction) => {
        const group = interaction.options.getSubcommandGroup(false) as "ignore" | undefined;
        const subcommand = interaction.options.getSubcommand(true) as
            | "ignore"
            | "unignore"
            | "disable"
            | "list"
            | "channel";

        if (!group && subcommand == "channel") {
            const channel = interaction.options.getChannel("channel", false);

            if (!channel) {
                const setChannel = await interaction.client.logChannels
                    .get(interaction.guildId!)
                    .catch(() => {});

                if (!!setChannel) {
                    return interaction.reply({
                        content: `Logging is being sent to <#${setChannel}>`,
                        ephemeral: true,
                    });
                } else {
                    return interaction.reply({
                        content: "No channel set!",
                        ephemeral: true,
                    });
                }
            }

            const { id: channelId } = channel;

            await interaction.client.logChannels.set(interaction.guildId!, channelId);

            return interaction.reply({
                content: `Logging is being sent to <#${channelId}>`,
                ephemeral: true,
            });
        } else if (!group && subcommand == "disable") {
            await interaction.client.logChannels.delete(interaction.guildId!);
            return interaction.reply({
                content: "Logging disabled.",
                ephemeral: true,
            });
        } else if (group == "ignore") {
            if (subcommand == "ignore") {
                const toIgnore = (interaction.options.getChannel("channel", false) ??
                    interaction.channel) as GuildChannel;

                await interaction.client.ignoredChannels.ignore(toIgnore);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`Ignored <#${toIgnore.id}>`)
                            .setColor(Colors.Green),
                    ],
                    ephemeral: true,
                });
            } else if (subcommand == "unignore") {
                const toUnignore = (interaction.options.getChannel("channel", false) ??
                    interaction.channel) as GuildChannel;

                const wasIgnored = await interaction.client.ignoredChannels.unignore(toUnignore);

                if (wasIgnored) {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`Unignored <#${toUnignore.id}>`)
                                .setColor(Colors.Red),
                        ],
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(
                                    `<#${toUnignore.id}> wasn't ignored, so there's nothing to unignore.`,
                                )
                                .setColor(Colors.Purple),
                        ],
                        ephemeral: true,
                    });
                }
            } else if (subcommand == "list") {
                const channelIds = await interaction.client.ignoredChannels
                    .list(interaction.guildId!)
                    .catch(() => {});

                if (!channelIds || channelIds.size == 0) {
                    return interaction.reply({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription("No channels ignored.")
                                .setColor(Colors.Purple),
                        ],
                        ephemeral: true,
                    });
                }

                const channels = await Promise.all(
                    [...channelIds].map(async id =>
                        interaction.client.channels.fetch(id).catch(() => {}),
                    ),
                ).then(channels => channels.filter(c => !!c) as GuildChannel[]);

                // sort according to channel list
                channels.sort((a, b) => a.position - b.position);

                // TODO: pagination
                // TODO: group under categories
                /*
                We want a list in the format of:
                - [indicator] channel
                - [indicator] category
                        - [indicator] channel // overrides
                        - [indicator] channel
                        ...
                */

               const list = new Map<string, { channel?: GuildChannel, children: GuildChannel[] }>();

                for (const channel of channels) {
                    if (!channel.parentId &&!list.has(channel.id)) {
                       list.set(channel.id, { channel: channel, children: [] });
                       continue;
                    }

                    if (!!channel.parentId) {
                        if (list.has(channel.parentId)) list.get(channel.parentId)!.children.push(channel);
                        else list.set(channel.parentId, { children: [channel] });
                    }
                }

                let description = "";

                for (const [id, { channel, children }] of list) {
                    const childList = `${children.map(c => `    - :x: <#${c.id}>`).join("\n")}\n`

                    if (!channel) {
                        description += `- :radio_button: <#${id}>\n${childList}`
                    } else {
                        description += `- :x: <#${id}>\n${childList}`
                    }
                }

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(
                                description
                            )
                            .setColor(Colors.Purple),
                    ],
                    ephemeral: true,
                });
            }
        }
    },
};

const makeBaseEmbed = (author: GuildMember): EmbedBuilder =>
    new EmbedBuilder()
        .setAuthor({ name: author.user.tag, iconURL: author.displayAvatarURL() })
        .setTimestamp(Date.now());

async function handleMessageUpdate(
    oldMessage: Message | PartialMessage,
    newMessage: Message | PartialMessage,
) {
    if (newMessage.author?.bot) return;
    if (!newMessage.inGuild()) return;

    const logChannelId = await newMessage.client.logChannels
        .get(oldMessage.guildId!)
        .catch(() => {});
    if (!logChannelId) return;

    const logChannel = (await newMessage.client.channels
        .fetch(logChannelId)
        .catch(() => {})) as GuildTextBasedChannel | null | void;
    if (!logChannel) return;

    const logEmbed = makeBaseEmbed(newMessage.member!).setColor(Colors.Purple);

    const followUps: MessageCreateOptions[] = [];

    let description = `<@${oldMessage.author?.id}> updated their message in <#${oldMessage.channelId}>.\n[Jump to message](${newMessage.url})`;

    const oldContent = oldMessage.content ?? "None";
    const newContent = newMessage.content ?? "None";

    if (oldContent != newContent) {
        logEmbed.addFields(
            {
                name: "New",
                value: newContent,
            },
            {
                name: "Old",
                value: oldContent,
            },
        );
    }

    const attachmentDiff = asymmetricDiff(oldMessage.attachments, newMessage.attachments);

    if (attachmentDiff.added.size > 0 || attachmentDiff.removed.size > 0) {
        logEmbed.addFields({
            name: "Attachments",
            value: `**Removed**: ${attachmentDiff.removed.size} | **Added**: ${attachmentDiff.added.size}`,
        });

        if (attachmentDiff.added.size > 0) {
            followUps.push({
                content: `Added ${pluralize(
                    "attachment",
                    "attachments",
                    attachmentDiff.added.size,
                )} (${attachmentDiff.added.size}):`,
                files: [...attachmentDiff.added.values()],
            });
        }

        if (attachmentDiff.removed.size > 0) {
            followUps.push({
                content: `Removed ${pluralize(
                    "attachment",
                    "attachments",
                    attachmentDiff.removed.size,
                )} (${attachmentDiff.removed.size}):`,
                files: [...attachmentDiff.removed.values()],
            });
        }
    }

    logEmbed.setDescription(description);

    const logMessage = await logChannel.send({ embeds: [logEmbed] });

    for (const followUp of followUps) {
        await logMessage.reply(followUp);
    }
}

async function handleMessageDelete(message: Message | PartialMessage) {
    if (message.author?.bot) return;
    if (!message.inGuild()) return;

    const logChannelId = await message.client.logChannels.get(message.guildId!);
    if (!logChannelId) return;

    const logChannel = (await message.client.channels
        .fetch(logChannelId)
        .catch(() => {})) as GuildTextBasedChannel | null | void;
    if (!logChannel) return;

    const logEmbed = makeBaseEmbed(message.member!).setColor(Colors.Red);

    const description = `<@${message.author?.id}> deleted their message in <#${message.channelId}>.`;

    logEmbed.setDescription(description);

    if (message.content.length > 0) {
        logEmbed.addFields({
            name: "Content",
            value: message.content,
        });
    }

    if (message.attachments.size > 0) {
        logEmbed.addFields({
            name: "Removed Attachments",
            value: `${message.attachments.size}`,
        });
    }

    let removed = 0;

    if (message.attachments.size == 1) {
        const first = message.attachments.first()!;
        message.attachments.delete(first.id);

        logEmbed.setImage(first.url);
        removed = 1;
    }

    const logMessage = await logChannel.send({ embeds: [logEmbed] });

    if (message.attachments.size > 0) {
        await logMessage.reply({
            content: `Removed ${pluralize(
                "attachment",
                "attachments",
                message.attachments.size + removed,
            )} (${message.attachments.size + removed}):`,
            files: [...message.attachments.values()],
        });
    }
}

async function handleMessageBulkDelete(
    messages: Collection<Snowflake, Message | PartialMessage>,
    channel: GuildTextBasedChannel,
) {
    if (!channel) return;

    const logChannelId = await channel.client.logChannels.get(channel.guildId!).catch(() => {});
    if (!logChannelId) return;

    const logChannel = (await channel.client.channels
        .fetch(logChannelId)
        .catch(() => {})) as GuildTextBasedChannel | null | void;
    if (!logChannel) return;

    let messagesString = "";

    for (const message of messages.values()) {
        if (message.author?.bot) continue;
        if (!message.inGuild()) continue;
        if (message.channelId != channel.id) continue;

        messagesString += `${message.author.username} (${message.member!.id}): ${
            message.content
        }}\n`;

        if (message.attachments.size > 0) {
            messagesString += `Attachments: \n${[
                ...message.attachments.mapValues(attachment => `   - ${attachment.url}`).values(),
            ].join("\n")}\n`;
        }

        messagesString += "------------------------------------\n";
    }

    const attachment = new AttachmentBuilder(Buffer.from(messagesString, "utf-8"), {
        name: "messages.txt",
    });

    logChannel.send({
        embeds: [
            new EmbedBuilder()
                .setDescription(`**${messages.size}** messages bulk deleted in ${channel.id}.`)
                .setColor(Colors.Red),
        ],
        files: [attachment],
    });
}
