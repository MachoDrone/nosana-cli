import { Command, CommanderError } from 'commander';
import { view } from '../action.js';

vi.mock('../action.js', () => ({ view: vi.fn() }));

const NODE = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';

describe('node view command', () => {
  let command: Command;
  let output: string;

  beforeEach(async () => {
    vi.resetModules();
    command = (await import('../command.js')).viewNodeCommand;
    output = '';
    command.exitOverride().configureOutput({
      writeOut: (text) => {
        output += text;
      },
      writeErr: (text) => {
        output += text;
      },
    });
  });

  it('accepts a full host public address and defaults to mainnet', async () => {
    await command.parseAsync([NODE], { from: 'user' });
    expect(view).toHaveBeenCalledOnce();
    expect(view).toHaveBeenCalledWith(
      NODE,
      expect.objectContaining({ network: 'mainnet' }),
      command,
    );
  });

  it('keeps devnet and custom RPC selection and accepts a single snapshot', async () => {
    await command.parseAsync(
      [
        NODE,
        '--network',
        'devnet',
        '--rpc',
        'https://rpc.example.invalid',
        '--once',
      ],
      { from: 'user' },
    );
    expect(view).toHaveBeenCalledWith(
      NODE,
      expect.objectContaining({
        network: 'devnet',
        rpc: 'https://rpc.example.invalid',
        once: true,
      }),
      command,
    );
  });

  it('shows help without invoking the action or requiring a node', async () => {
    await expect(
      command.parseAsync(['--help'], { from: 'user' }),
    ).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
      exitCode: 0,
    });
    expect(output).toContain('--once');
    expect(output).toContain('--network');
    expect(output).toContain('--rpc');
    expect(view).not.toHaveBeenCalled();
  });

  it.each(['help', '192.0.2.1', 'short', '0'.repeat(44)])(
    'rejects invalid node %s before invoking the action',
    async (node) => {
      await expect(
        command.parseAsync([node], { from: 'user' }),
      ).rejects.toBeInstanceOf(CommanderError);
      expect(output).toContain('--help');
      expect(view).not.toHaveBeenCalled();
    },
  );

  it('requires the node address', async () => {
    await expect(
      command.parseAsync([], { from: 'user' }),
    ).rejects.toMatchObject({
      code: 'commander.missingArgument',
    });
    expect(view).not.toHaveBeenCalled();
  });
});
