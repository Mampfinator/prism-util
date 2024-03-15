import {
    ChannelType,
    ChatInputCommandInteraction,
    PermissionsBitField,
    SlashCommandBuilder,
} from "discord.js";
import { CommandType } from "./command-loader";

export const CONFIG_COMMAND = {
    type: CommandType.SlashCommand as const,
    builder: new SlashCommandBuilder()
        .setName("config")
        .setDescription("Config commands")
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(requestChannel =>
            requestChannel
                .setName("request-channel")
                .setDescription(
                    "Configure the channel to send pin requests to.",
                )
                .addChannelOption(channel =>
                    channel
                        .setName("channel")
                        .setDescription("The channel to send pin requests to.")
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText),
                ),
        ) as SlashCommandBuilder,
    execute: async (interaction: ChatInputCommandInteraction) => {
        if (interaction.options.getSubcommand(false) == "request-channel") {
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

            await interaction.client.requestChannels.set(
                interaction.guildId!,
                channelId,
            );

            interaction.reply({
                content: `Requests will now be sent to <#${channelId}>`,
                ephemeral: true,
            });
        }
    },
};
