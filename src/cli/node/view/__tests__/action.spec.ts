import type { Client } from '@nosana/sdk';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { setTimeout as sleep } from 'node:timers/promises';

import { readNodeStatus, view } from '../action.js';
import { getSDK } from '../../../../services/sdk.js';
import { getJob } from '../../../job/get/action.js';

vi.mock('../../../../services/sdk.js', () => ({ getSDK: vi.fn() }));
vi.mock('../../../job/get/action.js', () => ({ getJob: vi.fn() }));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn() }));

const NODE = new PublicKey('4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi');
const JOB = new PublicKey('8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR');
const MARKET = new PublicKey(new Uint8Array(32).fill(3));
const OTHER = new PublicKey(new Uint8Array(32).fill(4));
const IDLE = 'Not assigned to a job or queued (host connectivity unknown)';

describe('public node view', () => {
  const jobs = { getRuns: vi.fn(), get: vi.fn(), allMarkets: vi.fn() };
  const forbiddenAccess = vi.fn(() => {
    throw new Error('Wallet, signing and writes are forbidden');
  });
  const sdk = new Proxy(
    { jobs },
    {
      get(target, property) {
        if (property === 'jobs') return target.jobs;
        return forbiddenAccess();
      },
    },
  ) as unknown as Client;
  let originalExitCode: typeof process.exitCode;
  let lines: string[];

  const run = (node = NODE) => ({
    publicKey: OTHER,
    account: { node, job: JOB },
  });
  const job = (state = 'RUNNING', node = NODE) => ({
    address: JOB,
    node,
    market: MARKET,
    state,
  });

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      lines.push(args.join(' '));
    });
    vi.mocked(getSDK).mockReturnValue(sdk);
    jobs.getRuns.mockResolvedValue([]);
    jobs.allMarkets.mockResolvedValue([]);
    jobs.get.mockResolvedValue(job());
    vi.mocked(sleep).mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    expect(forbiddenAccess).not.toHaveBeenCalled();
    expect(getJob).not.toHaveBeenCalled();
  });

  it('reads the selected node run and prints its exact job and market', async () => {
    jobs.getRuns.mockResolvedValue([run()]);
    const status = await readNodeStatus(sdk, NODE.toBase58());
    expect(jobs.getRuns).toHaveBeenCalledWith([
      { memcmp: { offset: 40, bytes: NODE.toBase58() } },
    ]);
    expect(jobs.get).toHaveBeenCalledWith(JOB.toBase58());
    expect(status).toContain(`Assigned job ${JOB.toBase58()}`);
    expect(status).toContain('[RUNNING]');
    expect(status).toContain(MARKET.toBase58());
    expect(jobs.allMarkets).not.toHaveBeenCalled();
  });

  it('reports a one-based queue position in the matching market', async () => {
    jobs.allMarkets.mockResolvedValue([
      { address: OTHER, queue: [OTHER] },
      { address: MARKET, queue: [OTHER, NODE, OTHER] },
    ]);
    const status = await readNodeStatus(sdk, NODE.toBase58());
    expect(status).toContain('Queued 2 / 3');
    expect(status).toContain(MARKET.toBase58());
    expect(jobs.get).not.toHaveBeenCalled();
  });

  it('does not call an unassigned host offline', async () => {
    expect(await readNodeStatus(sdk, NODE.toBase58())).toBe(IDLE);
  });

  it('keeps a queued job assignment distinct from running execution', async () => {
    jobs.getRuns.mockResolvedValue([run()]);
    jobs.get.mockResolvedValue(job('QUEUED', SystemProgram.programId));
    const status = await readNodeStatus(sdk, NODE.toBase58());
    expect(status).toContain('[QUEUED]');
    expect(status).not.toContain('[RUNNING]');
  });

  it.each(['COMPLETED', 'STOPPED'])(
    'does not label a terminal %s job running',
    async (state) => {
      jobs.getRuns.mockResolvedValue([run()]);
      jobs.get.mockResolvedValue(job(state));
      const status = await readNodeStatus(sdk, NODE.toBase58());
      expect(status).toContain(`[${state}]`);
      expect(status).not.toContain('[RUNNING]');
    },
  );

  it('rejects a run or job belonging to another node', async () => {
    jobs.getRuns.mockResolvedValue([run(OTHER)]);
    await expect(readNodeStatus(sdk, NODE.toBase58())).rejects.toThrow();
    expect(jobs.get).not.toHaveBeenCalled();
    jobs.getRuns.mockResolvedValue([run()]);
    jobs.get.mockResolvedValue(job('RUNNING', OTHER));
    await expect(readNodeStatus(sdk, NODE.toBase58())).rejects.toThrow();
  });

  it('rejects ambiguous multiple run or queue memberships', async () => {
    jobs.getRuns.mockResolvedValue([run(), run()]);
    await expect(readNodeStatus(sdk, NODE.toBase58())).rejects.toThrow();
    jobs.getRuns.mockResolvedValue([]);
    jobs.allMarkets.mockResolvedValue([
      { address: MARKET, queue: [NODE] },
      { address: OTHER, queue: [NODE] },
    ]);
    await expect(readNodeStatus(sdk, NODE.toBase58())).rejects.toThrow();
    jobs.allMarkets.mockResolvedValue([
      { address: MARKET, queue: [NODE, NODE] },
    ]);
    await expect(readNodeStatus(sdk, NODE.toBase58())).rejects.toThrow();
  });

  it('returns a single snapshot without sleeping', async () => {
    await view(NODE.toBase58(), { once: true }, undefined);
    expect(lines.join('\n')).toContain(IDLE);
    expect(jobs.getRuns).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('validates addresses before any SDK access', async () => {
    await expect(view('help', { once: true }, undefined)).rejects.toThrow();
    expect(getSDK).not.toHaveBeenCalled();
    expect(jobs.getRuns).not.toHaveBeenCalled();
  });

  it('reports RPC failure as unavailable and makes a failed snapshot exit nonzero', async () => {
    jobs.getRuns.mockRejectedValue(new Error('RPC unavailable'));
    await view(NODE.toBase58(), { once: true }, undefined);
    expect(lines.join('\n')).toContain('Status unavailable: RPC unavailable');
    expect(lines.join('\n')).not.toContain(IDLE);
    expect(process.exitCode).toBe(1);
    expect(jobs.allMarkets).not.toHaveBeenCalled();
  });

  it('observes queued, assigned, idle and failed/recovered reads without stale state', async () => {
    jobs.getRuns
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValue([]);
    jobs.allMarkets
      .mockResolvedValueOnce([{ address: MARKET, queue: [NODE] }])
      .mockResolvedValue([]);
    const done = new Error('test stop');
    vi.mocked(sleep)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(done);
    await expect(view(NODE.toBase58(), {}, undefined)).rejects.toBe(done);
    const output = lines.join('\n');
    expect(output).toContain('Queued 1 / 1');
    expect(output).toContain(JOB.toBase58());
    expect(output).toContain(IDLE);
    expect(output).toContain('Status unavailable: RPC unavailable');
    expect(lines.filter((line) => line.includes(IDLE))).toHaveLength(2);
    expect(process.exitCode).toBeUndefined();
  });

  it('paces 2000 polls without recursive calls or repeating unchanged status', async () => {
    const done = new Error('test stop');
    let polls = 0;
    vi.mocked(sleep).mockImplementation(async () => {
      if (++polls === 2000) throw done;
      return undefined;
    });
    await expect(view(NODE.toBase58(), {}, undefined)).rejects.toBe(done);
    expect(jobs.getRuns).toHaveBeenCalledTimes(2000);
    expect(sleep).toHaveBeenCalledTimes(2000);
    for (const call of vi.mocked(sleep).mock.calls) expect(call[0]).toBe(10000);
    expect(lines.filter((line) => line.includes(IDLE))).toHaveLength(1);
  });
});
