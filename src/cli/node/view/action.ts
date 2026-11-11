import { setTimeout as sleep } from 'node:timers/promises';
import type { Command } from 'commander';
import type { Client } from '@nosana/sdk';
import { PublicKey, SystemProgram } from '@solana/web3.js';

import { getSDK } from '../../../services/sdk.js';
import { parseNodeAddress } from './address.js';

const POLL_MS = 10_000;

function address(value: unknown): string {
  return new PublicKey(String(value)).toBase58();
}

/** Read only: never use the node handlers that can join, stop or quit work. */
export async function readNodeStatus(
  sdk: Client,
  node: string,
): Promise<string> {
  // RunAccount: 8-byte discriminator, 32-byte job, then 32-byte node.
  const runs = await sdk.jobs.getRuns([
    { memcmp: { offset: 40, bytes: node } },
  ]);
  if (!Array.isArray(runs)) throw new Error('Invalid run response');
  if (runs.some((run) => address(run.account.node) !== node)) {
    throw new Error('Run response does not match the requested node');
  }
  if (runs.length > 1) {
    throw new Error('Multiple assigned runs found; current job is ambiguous');
  }
  if (runs.length) {
    const jobAddress = address(runs[0].account.job);
    const job = await sdk.jobs.get(jobAddress);
    const jobNode = address(job.node);
    if (
      jobNode !== node &&
      !(
        job.state === 'QUEUED' && jobNode === SystemProgram.programId.toBase58()
      )
    ) {
      throw new Error('Job response does not match the assigned node');
    }
    const market = address(job.market);
    return `Assigned job ${jobAddress} [${job.state}] | market ${market}`;
  }

  const markets = await sdk.jobs.allMarkets();
  if (!Array.isArray(markets)) throw new Error('Invalid market response');
  const queued = [];
  for (const market of markets) {
    if (!Array.isArray(market.queue)) throw new Error('Invalid market queue');
    const queue = market.queue.map(address);
    const position = queue.indexOf(node);
    if (position !== -1) {
      if (queue.lastIndexOf(node) !== position) {
        throw new Error('Node appears more than once in a market queue');
      }
      queued.push(
        `Queued ${position + 1} / ${queue.length} | market ${address(
          market.address,
        )}`,
      );
    }
  }
  if (queued.length > 1) {
    throw new Error('Node appears in multiple market queues');
  }
  return (
    queued[0] ?? 'Not assigned to a job or queued (host connectivity unknown)'
  );
}

export async function view(
  node: string,
  options: { once?: boolean },
  _cmd: Command | undefined,
): Promise<void> {
  node = parseNodeAddress(node);
  const sdk = getSDK();
  console.log(`Node: ${node}`);
  console.log('Public chain status; this is not the host console log stream.');
  if (!options.once) console.log('Watching every 10 seconds. Ctrl-C to stop.');

  let previous: string | undefined;
  // The default SIGINT handler terminates the CLI even during an RPC request.
  // No recursive calls, subscriptions, overlapping polls or signal overrides.
  for (;;) {
    let status: string;
    try {
      status = await readNodeStatus(sdk, node);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status = `Status unavailable: ${message.replace(
        /[\x00-\x1f\x7f]/g,
        ' ',
      )}`;
      if (options.once) process.exitCode = 1;
    }
    if (status !== previous) {
      console.log(`[${new Date().toISOString()}] ${status}`);
      previous = status;
    }
    if (options.once) return;
    await sleep(POLL_MS);
  }
}
