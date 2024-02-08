import {
    ApplicationCommandType,
    Colors,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
    SlashCommandBuilder,
} from "discord.js";

export const INTERNAL_ERROR = new EmbedBuilder()
    .setDescription(":x: Internal error!")
    .setColor(Colors.Red);
export const MISSING_PERMISSIONS = new EmbedBuilder()
    .setDescription(":x: I don't have the permissions to do that here!")
    .setColor(Colors.Red);

export const NOT_CONFIGURED = new EmbedBuilder()
    .setDescription(":x: I'm not configured yet!")
    .setColor(Colors.Red);

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

export const PIN_REQUEST_APPROVED_FEEDBACK = new EmbedBuilder()
    .setDescription(":white_check_mark: Your pin request has been approved!")
    .setColor(Colors.Green);
export const PIN_REQUEST_APPROVED_MOD = new EmbedBuilder()
    .setDescription(":white_check_mark: Pin approved!")
    .setColor(Colors.Green);

export const PIN_REQUEST_DENIED_FEEDBACK = new EmbedBuilder()
    .setDescription(":x: Your pin request has been denied!")
    .setColor(Colors.Red);
export const PIN_REQUEST_DENIED_MOD = new EmbedBuilder()
    .setDescription(":x: Pin denied!")
    .setColor(Colors.Red);

export const REQUEST_PIN_COMMAND = new ContextMenuCommandBuilder()
    .setDMPermission(false)
    .setName("Request Pin")
    .setType(ApplicationCommandType.Message);

export const REQUEST_CHANNEL_COMMAND = new SlashCommandBuilder()
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .setName("request-channel")
    .setDescription("Request channel for pin requests.")
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
