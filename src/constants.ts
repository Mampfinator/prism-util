import { Colors, EmbedBuilder } from "discord.js";

export const INTERNAL_ERROR = new EmbedBuilder()
    .setDescription(":x: Internal error!")
    .setColor(Colors.Red);
export const MISSING_PERMISSIONS = new EmbedBuilder()
    .setDescription(":x: I don't have the permissions to do that here!")
    .setColor(Colors.Red);

export const NOT_CONFIGURED = new EmbedBuilder()
    .setDescription(":x: I'm not configured yet!")
    .setColor(Colors.Red);
