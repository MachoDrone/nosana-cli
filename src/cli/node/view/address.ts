import { InvalidArgumentError } from 'commander';
import { PublicKey } from '@solana/web3.js';

export function parseNodeAddress(value: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new InvalidArgumentError(
      'Expected the full Nosana node wallet address, not an IP address or "help". Use "nosana node view --help" for usage.',
    );
  }
}
