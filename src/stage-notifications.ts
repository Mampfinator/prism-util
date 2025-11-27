import { ChannelType, Client, Events, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import Keyv from "keyv";

export interface StageNotificationInfo {
    message: string;
    /**
     * The ID of the channel to send the notification to. If not overridden, defaults to the stage that went live.
     */
    channelId: string;
}

export class StageNotifications {
    private readonly notificationSettings: Keyv<{ message: string, channelId?: string}>;
    
    constructor(dbPath: string) {
        this.notificationSettings = new Keyv(dbPath, {
            namespace: "stage-notifications",
        });
    }

    public async setNotification(stageId: string, message: string, channelId?: string) {
        await this.notificationSettings.set(stageId, { message, channelId});
    }

    public async getNotification(stageId: string): Promise<StageNotificationInfo | undefined> {
        const info = await this.notificationSettings.get(stageId);
        if (!info) return;

        return {
            message: info.message,
            channelId: info.channelId ?? stageId,
        }
    }

    public async deleteNotification(stageId: string): Promise<boolean> {
        return await this.notificationSettings.delete(stageId)
    }
}

export const SET_STAGE_NOTIFICATION_COMMAND = new SlashCommandBuilder()
    .setName("stage-notif")
    .setDescription("Manage stage notifications.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(set => set
        .setName("set")
        .setDescription("Set a notification message for when a stage goes live.")
        .addChannelOption(channel => channel.setName("stage").setDescription("The stage to monitor").setRequired(true).addChannelTypes(ChannelType.GuildStageVoice))
        .addStringOption(message => message.setName("message").setDescription("The notification message to send").setRequired(true))
        .addChannelOption(channel => channel.setName("notification-channel").setDescription("The channel to send the notification to").setRequired(false).addChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)))
    .addSubcommand(remove => remove
        .setName("remove")
        .setDescription("Remove the notification message for a stage.")
        .addChannelOption(channel => channel.setName("stage").setDescription("The stage to stop monitoring").setRequired(true).addChannelTypes(ChannelType.GuildStageVoice)));

export function register(client: Client) {
    client.on(Events.StageInstanceCreate, async instance => {
        const notification = await client.stageNotifications.getNotification(instance.channelId);
        if (!notification) return;

        const channel = await client.channels.fetch(notification.channelId);
        if (!channel || !channel.isTextBased()) return;

        await channel.send({ content: notification.message });
    });

    client.commandLoader.addCommand({
        type: "SlashCommand",
        builder: SET_STAGE_NOTIFICATION_COMMAND,
        async execute(interaction) {
            const sub = interaction.options.getSubcommand(true);

            if (sub == "set") {
                const stageChannel = interaction.options.getChannel("stage", true);
                const message = interaction.options.getString("message", true);
                const notificationChannel = interaction.options.getChannel("notification-channel") ?? stageChannel;

                await client.stageNotifications.setNotification(
                    stageChannel.id,
                    message,
                    notificationChannel.id,
                );

                await interaction.reply({
                    content: `Set stage notification for ${stageChannel} to be sent in ${notificationChannel}.`,
                    ephemeral: true,
                });
            } else if (sub == "remove") {
                const stage = interaction.options.getChannel("stage", true);
                await client.stageNotifications.deleteNotification(stage.id);

                await interaction.reply({
                    content: `Stage notification for ${stage} removed.`
                });
            }
        }
    });
}