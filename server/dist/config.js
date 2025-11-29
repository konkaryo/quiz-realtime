"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CFG = void 0;
exports.CFG = {
    PORT: Number(process.env.PORT || 3001),
    CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
    IMG_DIR: process.env.IMG_DIR || "img",
    QUESTION_COUNT: Number(process.env.QUESTION_COUNT || 10),
    ROUND_MS: Number(process.env.ROUND_MS || 10000),
    GAP_MS: Number(process.env.GAP_MS || 3001),
    FINAL_LB_MS: Number(process.env.FINAL_LB_MS || 10000),
    TEXT_LIVES: Number(process.env.TEXT_LIVES || 3),
    MC_ANSWER_POINTS_GAIN: Number(process.env.MC_ANSWER_POINTS_GAIN || 70),
    TXT_ANSWER_POINTS_GAIN: Number(process.env.TXT_ANSWER_POINTS_GAIN || 100),
};
