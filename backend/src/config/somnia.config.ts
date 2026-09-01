// backend/src/config/somnia.config.ts
// Somnia testnet chain configuration for DreamDEX Event Contracts

export const SOMNIA_CHAIN = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://dream-rpc.somnia.network'] },
    public: { http: ['https://dream-rpc.somnia.network'] },
  },
} as const;

// The two assets DreamDEX Event Contracts trade on
export const EC_ASSETS = ['BTC', 'ETH'] as const;
export type ECAsset = typeof EC_ASSETS[number];

// The two window cadences in seconds
export const EC_CADENCES = [900, 3600] as const; // 15m = 900s, 1h = 3600s
export type ECCadence = typeof EC_CADENCES[number];

export const cadenceLabel = (intervalSec: number): string =>
  intervalSec === 900 ? '15m' : intervalSec === 3600 ? '1h' : `${intervalSec}s`;

// Market key used throughout the app — never use pool address
export const marketKey = (asset: string, intervalSec: number): string =>
  `${asset}-${cadenceLabel(intervalSec)}`;
