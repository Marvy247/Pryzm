/**
 * UNIFIED TRADEABLE TOKENS
 * 
 * This list contains ONLY tokens that are available on BOTH:
 * 1. Binance USDT-M Perpetual Futures (for chart data, technical analysis)
 * 2. Hyperliquid Perpetuals (for trade execution)
 * 
 * Tokens are cross-referenced from:
 * - Binance fapi/v1/exchangeInfo (USDT perpetuals with status: TRADING)
 * - Hyperliquid perpetuals meta API
 * 
 * Last updated: December 2, 2025
 * 
 * The scanner and analyzer agents should ONLY recommend tokens from this list
 * to ensure all signals can be both analyzed (via Binance) and traded (via Hyperliquid).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TOKENS AVAILABLE ON BOTH BINANCE FUTURES AND HYPERLIQUID
// Format: { symbol, coingeckoId, category }
// ═══════════════════════════════════════════════════════════════════════════════

export interface TradeableToken {
  symbol: string;
  coingeckoId: string;
  category: 'major' | 'layer2' | 'defi' | 'gaming' | 'ai' | 'meme' | 'ecosystem' | 'infrastructure' | 'other';
  binanceSymbol: string; // Symbol on Binance (e.g., 'BTCUSDT')
  hyperliquidSymbol: string; // Symbol on Hyperliquid (e.g., 'BTC')
}

export const TRADEABLE_TOKENS: TradeableToken[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // MAJOR COINS
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'BTC', coingeckoId: 'bitcoin', category: 'major', binanceSymbol: 'BTCUSDT', hyperliquidSymbol: 'BTC' },
  { symbol: 'ETH', coingeckoId: 'ethereum', category: 'major', binanceSymbol: 'ETHUSDT', hyperliquidSymbol: 'ETH' },
  { symbol: 'SOL', coingeckoId: 'solana', category: 'major', binanceSymbol: 'SOLUSDT', hyperliquidSymbol: 'SOL' },
  { symbol: 'BNB', coingeckoId: 'binancecoin', category: 'major', binanceSymbol: 'BNBUSDT', hyperliquidSymbol: 'BNB' },
  { symbol: 'ADA', coingeckoId: 'cardano', category: 'major', binanceSymbol: 'ADAUSDT', hyperliquidSymbol: 'ADA' },
  { symbol: 'AVAX', coingeckoId: 'avalanche-2', category: 'major', binanceSymbol: 'AVAXUSDT', hyperliquidSymbol: 'AVAX' },
  { symbol: 'DOGE', coingeckoId: 'dogecoin', category: 'major', binanceSymbol: 'DOGEUSDT', hyperliquidSymbol: 'DOGE' },
  { symbol: 'XRP', coingeckoId: 'ripple', category: 'major', binanceSymbol: 'XRPUSDT', hyperliquidSymbol: 'XRP' },
  { symbol: 'LTC', coingeckoId: 'litecoin', category: 'major', binanceSymbol: 'LTCUSDT', hyperliquidSymbol: 'LTC' },
  { symbol: 'BCH', coingeckoId: 'bitcoin-cash', category: 'major', binanceSymbol: 'BCHUSDT', hyperliquidSymbol: 'BCH' },
  { symbol: 'ETC', coingeckoId: 'ethereum-classic', category: 'major', binanceSymbol: 'ETCUSDT', hyperliquidSymbol: 'ETC' },
  { symbol: 'ATOM', coingeckoId: 'cosmos', category: 'major', binanceSymbol: 'ATOMUSDT', hyperliquidSymbol: 'ATOM' },
  { symbol: 'DOT', coingeckoId: 'polkadot', category: 'major', binanceSymbol: 'DOTUSDT', hyperliquidSymbol: 'DOT' },
  { symbol: 'LINK', coingeckoId: 'chainlink', category: 'major', binanceSymbol: 'LINKUSDT', hyperliquidSymbol: 'LINK' },
  { symbol: 'UNI', coingeckoId: 'uniswap', category: 'major', binanceSymbol: 'UNIUSDT', hyperliquidSymbol: 'UNI' },
  { symbol: 'TRX', coingeckoId: 'tron', category: 'major', binanceSymbol: 'TRXUSDT', hyperliquidSymbol: 'TRX' },
  { symbol: 'XLM', coingeckoId: 'stellar', category: 'major', binanceSymbol: 'XLMUSDT', hyperliquidSymbol: 'XLM' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2 & INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'ARB', coingeckoId: 'arbitrum', category: 'layer2', binanceSymbol: 'ARBUSDT', hyperliquidSymbol: 'ARB' },
  { symbol: 'OP', coingeckoId: 'optimism', category: 'layer2', binanceSymbol: 'OPUSDT', hyperliquidSymbol: 'OP' },
  { symbol: 'POL', coingeckoId: 'matic-network', category: 'layer2', binanceSymbol: 'POLUSDT', hyperliquidSymbol: 'POL' },
  { symbol: 'NEAR', coingeckoId: 'near', category: 'layer2', binanceSymbol: 'NEARUSDT', hyperliquidSymbol: 'NEAR' },
  { symbol: 'FIL', coingeckoId: 'filecoin', category: 'infrastructure', binanceSymbol: 'FILUSDT', hyperliquidSymbol: 'FIL' },
  { symbol: 'ICP', coingeckoId: 'internet-computer', category: 'infrastructure', binanceSymbol: 'ICPUSDT', hyperliquidSymbol: 'ICP' },
  { symbol: 'STX', coingeckoId: 'blockstack', category: 'layer2', binanceSymbol: 'STXUSDT', hyperliquidSymbol: 'STX' },
  { symbol: 'SEI', coingeckoId: 'sei-network', category: 'layer2', binanceSymbol: 'SEIUSDT', hyperliquidSymbol: 'SEI' },
  { symbol: 'STRK', coingeckoId: 'starknet', category: 'layer2', binanceSymbol: 'STRKUSDT', hyperliquidSymbol: 'STRK' },
  { symbol: 'ZK', coingeckoId: 'zksync', category: 'layer2', binanceSymbol: 'ZKUSDT', hyperliquidSymbol: 'ZK' },
  { symbol: 'METIS', coingeckoId: 'metis-token', category: 'layer2', binanceSymbol: 'METISUSDT', hyperliquidSymbol: 'METIS' },
  { symbol: 'MANTA', coingeckoId: 'manta-network', category: 'layer2', binanceSymbol: 'MANTAUSDT', hyperliquidSymbol: 'MANTA' },
  { symbol: 'RENDER', coingeckoId: 'render-token', category: 'infrastructure', binanceSymbol: 'RENDERUSDT', hyperliquidSymbol: 'RENDER' },
  { symbol: 'AR', coingeckoId: 'arweave', category: 'infrastructure', binanceSymbol: 'ARUSDT', hyperliquidSymbol: 'AR' },
  { symbol: 'KAS', coingeckoId: 'kaspa', category: 'infrastructure', binanceSymbol: 'KASUSDT', hyperliquidSymbol: 'KAS' },
  { symbol: 'TON', coingeckoId: 'the-open-network', category: 'infrastructure', binanceSymbol: 'TONUSDT', hyperliquidSymbol: 'TON' },
  { symbol: 'HBAR', coingeckoId: 'hedera-hashgraph', category: 'infrastructure', binanceSymbol: 'HBARUSDT', hyperliquidSymbol: 'HBAR' },
  { symbol: 'ALGO', coingeckoId: 'algorand', category: 'infrastructure', binanceSymbol: 'ALGOUSDT', hyperliquidSymbol: 'ALGO' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFI
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'AAVE', coingeckoId: 'aave', category: 'defi', binanceSymbol: 'AAVEUSDT', hyperliquidSymbol: 'AAVE' },
  { symbol: 'MKR', coingeckoId: 'maker', category: 'defi', binanceSymbol: 'MKRUSDT', hyperliquidSymbol: 'MKR' },
  { symbol: 'SNX', coingeckoId: 'havven', category: 'defi', binanceSymbol: 'SNXUSDT', hyperliquidSymbol: 'SNX' },
  { symbol: 'COMP', coingeckoId: 'compound-governance-token', category: 'defi', binanceSymbol: 'COMPUSDT', hyperliquidSymbol: 'COMP' },
  { symbol: 'CRV', coingeckoId: 'curve-dao-token', category: 'defi', binanceSymbol: 'CRVUSDT', hyperliquidSymbol: 'CRV' },
  { symbol: 'SUSHI', coingeckoId: 'sushi', category: 'defi', binanceSymbol: 'SUSHIUSDT', hyperliquidSymbol: 'SUSHI' },
  { symbol: 'DYDX', coingeckoId: 'dydx-chain', category: 'defi', binanceSymbol: 'DYDXUSDT', hyperliquidSymbol: 'DYDX' },
  { symbol: 'LDO', coingeckoId: 'lido-dao', category: 'defi', binanceSymbol: 'LDOUSDT', hyperliquidSymbol: 'LDO' },
  { symbol: 'PENDLE', coingeckoId: 'pendle', category: 'defi', binanceSymbol: 'PENDLEUSDT', hyperliquidSymbol: 'PENDLE' },
  { symbol: 'CAKE', coingeckoId: 'pancakeswap-token', category: 'defi', binanceSymbol: 'CAKEUSDT', hyperliquidSymbol: 'CAKE' },
  { symbol: 'RSR', coingeckoId: 'reserve-rights-token', category: 'defi', binanceSymbol: 'RSRUSDT', hyperliquidSymbol: 'RSR' },
  { symbol: 'JTO', coingeckoId: 'jito-governance-token', category: 'defi', binanceSymbol: 'JTOUSDT', hyperliquidSymbol: 'JTO' },
  { symbol: 'JUP', coingeckoId: 'jupiter-exchange-solana', category: 'defi', binanceSymbol: 'JUPUSDT', hyperliquidSymbol: 'JUP' },
  { symbol: 'ONDO', coingeckoId: 'ondo-finance', category: 'defi', binanceSymbol: 'ONDOUSDT', hyperliquidSymbol: 'ONDO' },
  { symbol: 'ETHFI', coingeckoId: 'ether-fi', category: 'defi', binanceSymbol: 'ETHFIUSDT', hyperliquidSymbol: 'ETHFI' },
  { symbol: 'ENA', coingeckoId: 'ethena', category: 'defi', binanceSymbol: 'ENAUSDT', hyperliquidSymbol: 'ENA' },
  { symbol: 'EIGEN', coingeckoId: 'eigenlayer', category: 'defi', binanceSymbol: 'EIGENUSDT', hyperliquidSymbol: 'EIGEN' },
  { symbol: 'AERO', coingeckoId: 'aerodrome-finance', category: 'defi', binanceSymbol: 'AEROUSDT', hyperliquidSymbol: 'AERO' },
  { symbol: 'RUNE', coingeckoId: 'thorchain', category: 'defi', binanceSymbol: 'RUNEUSDT', hyperliquidSymbol: 'RUNE' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GAMING & METAVERSE
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'IMX', coingeckoId: 'immutable-x', category: 'gaming', binanceSymbol: 'IMXUSDT', hyperliquidSymbol: 'IMX' },
  { symbol: 'GALA', coingeckoId: 'gala', category: 'gaming', binanceSymbol: 'GALAUSDT', hyperliquidSymbol: 'GALA' },
  { symbol: 'SAND', coingeckoId: 'the-sandbox', category: 'gaming', binanceSymbol: 'SANDUSDT', hyperliquidSymbol: 'SAND' },
  { symbol: 'AXS', coingeckoId: 'axie-infinity', category: 'gaming', binanceSymbol: 'AXSUSDT', hyperliquidSymbol: 'AXS' },
  { symbol: 'APE', coingeckoId: 'apecoin', category: 'gaming', binanceSymbol: 'APEUSDT', hyperliquidSymbol: 'APE' },
  { symbol: 'SUPER', coingeckoId: 'superfarm', category: 'gaming', binanceSymbol: 'SUPERUSDT', hyperliquidSymbol: 'SUPER' },
  { symbol: 'PIXEL', coingeckoId: 'pixels', category: 'gaming', binanceSymbol: 'PIXELUSDT', hyperliquidSymbol: 'PIXEL' },
  { symbol: 'XAI', coingeckoId: 'xai-games', category: 'gaming', binanceSymbol: 'XAIUSDT', hyperliquidSymbol: 'XAI' },
  { symbol: 'ACE', coingeckoId: 'fusionist', category: 'gaming', binanceSymbol: 'ACEUSDT', hyperliquidSymbol: 'ACE' },
  { symbol: 'MAVIA', coingeckoId: 'heroes-of-mavia', category: 'gaming', binanceSymbol: 'MAVIAUSDT', hyperliquidSymbol: 'MAVIA' },
  { symbol: 'YGG', coingeckoId: 'yield-guild-games', category: 'gaming', binanceSymbol: 'YGGUSDT', hyperliquidSymbol: 'YGG' },
  { symbol: 'PORTAL', coingeckoId: 'portal-2', category: 'gaming', binanceSymbol: 'PORTALUSDT', hyperliquidSymbol: 'PORTAL' },
  { symbol: 'RONIN', coingeckoId: 'ronin', category: 'gaming', binanceSymbol: 'RONINUSDT', hyperliquidSymbol: 'RONIN' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AI & DATA
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'FET', coingeckoId: 'fetch-ai', category: 'ai', binanceSymbol: 'FETUSDT', hyperliquidSymbol: 'FET' },
  { symbol: 'TAO', coingeckoId: 'bittensor', category: 'ai', binanceSymbol: 'TAOUSDT', hyperliquidSymbol: 'TAO' },
  { symbol: 'IO', coingeckoId: 'io-net', category: 'ai', binanceSymbol: 'IOUSDT', hyperliquidSymbol: 'IO' },
  { symbol: 'TURBO', coingeckoId: 'turbo', category: 'ai', binanceSymbol: 'TURBOUSDT', hyperliquidSymbol: 'TURBO' },
  { symbol: 'WLD', coingeckoId: 'worldcoin-wld', category: 'ai', binanceSymbol: 'WLDUSDT', hyperliquidSymbol: 'WLD' },
  { symbol: 'AIXBT', coingeckoId: 'aixbt', category: 'ai', binanceSymbol: 'AIXBTUSDT', hyperliquidSymbol: 'AIXBT' },
  { symbol: 'PROMPT', coingeckoId: 'wayfinder', category: 'ai', binanceSymbol: 'PROMPTUSDT', hyperliquidSymbol: 'PROMPT' },
  { symbol: 'KAITO', coingeckoId: 'kaito', category: 'ai', binanceSymbol: 'KAITOUSDT', hyperliquidSymbol: 'KAITO' },
  { symbol: 'PHA', coingeckoId: 'pha', category: 'ai', binanceSymbol: 'PHAUSDT', hyperliquidSymbol: 'PHA' },
  { symbol: 'SWARMS', coingeckoId: 'swarms', category: 'ai', binanceSymbol: 'SWARMSUSDT', hyperliquidSymbol: 'SWARMS' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MEME COINS
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'PEPE', coingeckoId: 'pepe', category: 'meme', binanceSymbol: '1000PEPEUSDT', hyperliquidSymbol: 'kPEPE' },
  { symbol: 'SHIB', coingeckoId: 'shiba-inu', category: 'meme', binanceSymbol: '1000SHIBUSD', hyperliquidSymbol: 'kSHIB' },
  { symbol: 'WIF', coingeckoId: 'dogwifcoin', category: 'meme', binanceSymbol: 'WIFUSDT', hyperliquidSymbol: 'WIF' },
  { symbol: 'POPCAT', coingeckoId: 'popcat', category: 'meme', binanceSymbol: 'POPCATUSDT', hyperliquidSymbol: 'POPCAT' },
  { symbol: 'BONK', coingeckoId: 'bonk', category: 'meme', binanceSymbol: '1000BONKUSDT', hyperliquidSymbol: 'kBONK' },
  { symbol: 'FLOKI', coingeckoId: 'floki', category: 'meme', binanceSymbol: '1000FLOKIUSDT', hyperliquidSymbol: 'kFLOKI' },
  { symbol: 'MEME', coingeckoId: 'memecoin-2', category: 'meme', binanceSymbol: 'MEMEUSDT', hyperliquidSymbol: 'MEME' },
  { symbol: 'FARTCOIN', coingeckoId: 'fartcoin', category: 'meme', binanceSymbol: 'FARTCOINUSDT', hyperliquidSymbol: 'FARTCOIN' },
  { symbol: 'PENGU', coingeckoId: 'pudgy-penguins', category: 'meme', binanceSymbol: 'PENGUUSDT', hyperliquidSymbol: 'PENGU' },
  { symbol: 'HMSTR', coingeckoId: 'hamster-kombat', category: 'meme', binanceSymbol: 'HMSTRUSDT', hyperliquidSymbol: 'HMSTR' },
  { symbol: 'CATI', coingeckoId: 'catizen', category: 'meme', binanceSymbol: 'CATIUSDT', hyperliquidSymbol: 'CATI' },
  { symbol: 'DOOD', coingeckoId: 'doodles', category: 'meme', binanceSymbol: 'DOODUSDT', hyperliquidSymbol: 'DOOD' },
  { symbol: 'BAN', coingeckoId: 'banana', category: 'meme', binanceSymbol: 'BANUSDT', hyperliquidSymbol: 'BAN' },
  { symbol: 'TRUMP', coingeckoId: 'official-trump', category: 'meme', binanceSymbol: 'TRUMPUSDT', hyperliquidSymbol: 'TRUMP' },
  { symbol: 'MOVE', coingeckoId: 'movement', category: 'meme', binanceSymbol: 'MOVEUSDT', hyperliquidSymbol: 'MOVE' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW ECOSYSTEMS
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'SUI', coingeckoId: 'sui', category: 'ecosystem', binanceSymbol: 'SUIUSDT', hyperliquidSymbol: 'SUI' },
  { symbol: 'TIA', coingeckoId: 'celestia', category: 'ecosystem', binanceSymbol: 'TIAUSDT', hyperliquidSymbol: 'TIA' },
  { symbol: 'APT', coingeckoId: 'aptos', category: 'ecosystem', binanceSymbol: 'APTUSDT', hyperliquidSymbol: 'APT' },
  { symbol: 'INJ', coingeckoId: 'injective-protocol', category: 'ecosystem', binanceSymbol: 'INJUSDT', hyperliquidSymbol: 'INJ' },
  { symbol: 'PYTH', coingeckoId: 'pyth-network', category: 'ecosystem', binanceSymbol: 'PYTHUSDT', hyperliquidSymbol: 'PYTH' },
  { symbol: 'W', coingeckoId: 'wormhole', category: 'ecosystem', binanceSymbol: 'WUSDT', hyperliquidSymbol: 'W' },
  { symbol: 'DYM', coingeckoId: 'dymension', category: 'ecosystem', binanceSymbol: 'DYMUSDT', hyperliquidSymbol: 'DYM' },
  { symbol: 'ALT', coingeckoId: 'altlayer', category: 'ecosystem', binanceSymbol: 'ALTUSDT', hyperliquidSymbol: 'ALT' },
  { symbol: 'BERA', coingeckoId: 'berachain-bera', category: 'ecosystem', binanceSymbol: 'BERAUSDT', hyperliquidSymbol: 'BERA' },
  { symbol: 'INIT', coingeckoId: 'initia', category: 'ecosystem', binanceSymbol: 'INITUSDT', hyperliquidSymbol: 'INIT' },
  { symbol: 'HYPE', coingeckoId: 'hyperliquid', category: 'ecosystem', binanceSymbol: 'HYPEUSDT', hyperliquidSymbol: 'HYPE' },
  { symbol: 'S', coingeckoId: 'sonic-3', category: 'ecosystem', binanceSymbol: 'SUSDT', hyperliquidSymbol: 'S' },
  { symbol: 'ANIME', coingeckoId: 'animecoin', category: 'ecosystem', binanceSymbol: 'ANIMEUSDT', hyperliquidSymbol: 'ANIME' },
  { symbol: 'LAYER', coingeckoId: 'layer-ai', category: 'ecosystem', binanceSymbol: 'LAYERUSDT', hyperliquidSymbol: 'LAYER' },
  { symbol: 'NOT', coingeckoId: 'notcoin', category: 'ecosystem', binanceSymbol: 'NOTUSDT', hyperliquidSymbol: 'NOT' },
  { symbol: 'ZRO', coingeckoId: 'layerzero', category: 'ecosystem', binanceSymbol: 'ZROUSDT', hyperliquidSymbol: 'ZRO' },
  { symbol: 'AXL', coingeckoId: 'axelar', category: 'ecosystem', binanceSymbol: 'AXLUSDT', hyperliquidSymbol: 'AXL' },
  { symbol: 'NTRN', coingeckoId: 'neutron-3', category: 'ecosystem', binanceSymbol: 'NTRNUSDT', hyperliquidSymbol: 'NTRN' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER NOTABLE TOKENS
  // ═══════════════════════════════════════════════════════════════════════════
  { symbol: 'ORDI', coingeckoId: 'ordinals', category: 'other', binanceSymbol: 'ORDIUSDT', hyperliquidSymbol: 'ORDI' },
  { symbol: 'BLUR', coingeckoId: 'blur', category: 'other', binanceSymbol: 'BLURUSDT', hyperliquidSymbol: 'BLUR' },
  { symbol: 'ENS', coingeckoId: 'ethereum-name-service', category: 'other', binanceSymbol: 'ENSUSDT', hyperliquidSymbol: 'ENS' },
  { symbol: 'GMT', coingeckoId: 'stepn', category: 'other', binanceSymbol: 'GMTUSDT', hyperliquidSymbol: 'GMT' },
  { symbol: 'TRB', coingeckoId: 'tellor', category: 'other', binanceSymbol: 'TRBUSDT', hyperliquidSymbol: 'TRB' },
  { symbol: 'OM', coingeckoId: 'mantra-dao', category: 'other', binanceSymbol: 'OMUSDT', hyperliquidSymbol: 'OM' },
  { symbol: 'USTC', coingeckoId: 'terrausd', category: 'other', binanceSymbol: 'USTCUSDT', hyperliquidSymbol: 'USTC' },
  { symbol: 'ME', coingeckoId: 'magic-eden', category: 'other', binanceSymbol: 'MEUSDT', hyperliquidSymbol: 'ME' },
  { symbol: 'SAFE', coingeckoId: 'safe', category: 'other', binanceSymbol: 'SAFEUSDT', hyperliquidSymbol: 'SAFE' },
  { symbol: 'SCR', coingeckoId: 'scroll', category: 'other', binanceSymbol: 'SCRUSDT', hyperliquidSymbol: 'SCR' },
  { symbol: 'WCT', coingeckoId: 'walletconnect', category: 'other', binanceSymbol: 'WCTUSDT', hyperliquidSymbol: 'WCT' },
  { symbol: 'ZORA', coingeckoId: 'zora', category: 'other', binanceSymbol: 'ZORAUSDT', hyperliquidSymbol: 'ZORA' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER CONSTANTS AND FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set of all tradeable symbols for O(1) lookup
 */
export const TRADEABLE_SYMBOLS_SET = new Set(TRADEABLE_TOKENS.map(t => t.symbol));

/**
 * Map of symbol to token info for O(1) lookup
 */
export const TRADEABLE_TOKENS_MAP = new Map(TRADEABLE_TOKENS.map(t => [t.symbol, t]));

/**
 * Map of symbol to CoinGecko ID
 */
export const SYMBOL_TO_COINGECKO: Record<string, string> = Object.fromEntries(
  TRADEABLE_TOKENS.map(t => [t.symbol, t.coingeckoId])
);

/**
 * Check if a symbol is tradeable on both exchanges
 */
export function isTradeableSymbol(symbol: string): boolean {
  const normalized = symbol.toUpperCase().replace('USDT', '').replace('-PERP', '');
  return TRADEABLE_SYMBOLS_SET.has(normalized);
}

/**
 * Get token info by symbol
 */
export function getTokenInfo(symbol: string): TradeableToken | undefined {
  const normalized = symbol.toUpperCase().replace('USDT', '').replace('-PERP', '');
  return TRADEABLE_TOKENS_MAP.get(normalized);
}

/**
 * Get Binance symbol for a token
 */
export function getBinanceSymbol(symbol: string): string | undefined {
  const token = getTokenInfo(symbol);
  return token?.binanceSymbol;
}

/**
 * Get Hyperliquid symbol for a token
 */
export function getHyperliquidSymbol(symbol: string): string | undefined {
  const token = getTokenInfo(symbol);
  return token?.hyperliquidSymbol;
}

/**
 * Get tokens by category
 */
export function getTokensByCategory(category: TradeableToken['category']): TradeableToken[] {
  return TRADEABLE_TOKENS.filter(t => t.category === category);
}

/**
 * Generate a formatted list for LLM prompts
 */
export function generateTradeableTokensList(): string {
  const categories = {
    major: 'Major Coins',
    layer2: 'Layer 2 & Infrastructure',
    defi: 'DeFi',
    gaming: 'Gaming & Metaverse',
    ai: 'AI & Data',
    meme: 'Meme Coins',
    ecosystem: 'New Ecosystems',
    infrastructure: 'Infrastructure',
    other: 'Other',
  };
  
  let result = '';
  for (const [category, label] of Object.entries(categories)) {
    const tokens = TRADEABLE_TOKENS.filter(t => t.category === category);
    if (tokens.length > 0) {
      result += `**${label}:**\n`;
      result += tokens.map(t => `${t.symbol} (${t.coingeckoId})`).join(', ') + '\n\n';
    }
  }
  
  return result.trim();
}

/**
 * Total count of tradeable tokens
 */
export const TRADEABLE_TOKENS_COUNT = TRADEABLE_TOKENS.length;

// Export the formatted list for agent prompts
export const TRADEABLE_TOKENS_LIST = generateTradeableTokensList();
