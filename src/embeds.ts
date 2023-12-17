import {
    Colors,
    EmbedBuilder,
} from "discord.js";

export const INTERNAL_ERROR_EMBED = new EmbedBuilder()
    .setDescription(":x: Internal error!")
    .setColor(Colors.Red);
export const MISSING_PERMISSIONS_EMBED = new EmbedBuilder()
    .setDescription(":x: I don't have the permissions to do that here!")
    .setColor(Colors.Red);

export const NOT_CONFIGURED_EMBED = new EmbedBuilder()
    .setDescription(":x: I'm not configured yet!")
    .setColor(Colors.Red);

export const PIN_REQUEST_ALREADY_PINNED_EMBED = new EmbedBuilder()
    .setDescription(":x: This message is already pinned, silly!")
    .setColor(Colors.Red);

export const PIN_REQUESTED_EMBED = new EmbedBuilder()
    .setDescription(
        ":white_check_mark: Your request has been sent to the mods! Please be patient while they have a look. :coffee:",
    )
    .setColor(Colors.Green);

export const PIN_REQUEST_APPROVED_FEEDBACK_EMBED = new EmbedBuilder()
    .setDescription(":white_check_mark: Your pin request has been approved!")
    .setColor(Colors.Green);
export const PIN_REQUEST_APPROVED_MOD_EMBED = new EmbedBuilder()
    .setDescription(":white_check_mark: Pin approved!")
    .setColor(Colors.Green);

export const PIN_REQUEST_DENIED_FEEDBACK_EMBED = new EmbedBuilder()
    .setDescription(":x: Your pin request has been denied!")
    .setColor(Colors.Red);
export const PIN_REQUEST_DENIED_MOD_EMBED = new EmbedBuilder()
    .setDescription(":x: Pin denied!")
    .setColor(Colors.Red);
