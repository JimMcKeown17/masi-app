'use strict';

const BANNED_WORDS = Object.freeze([/\bcount(?:ing)?[\s-]+on\b/i, /\bcount(?:ing)?[\s-]+all\b/i, /\bsubiti[sz]\w*/i, /\bnumber[\s-]+bonds?\b/i,
  /\brungs?\b/i, /\bladders?\b/i, /\bbands?\b/i, /\bstrateg\w*/i]);

module.exports = { BANNED_WORDS };
