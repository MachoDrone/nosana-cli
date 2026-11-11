import { Command } from 'commander';

import { view } from './action.js';
import { parseNodeAddress } from './address.js';
import { networkOption, rpcOption } from '../../sharedOptions/index.js';

export const viewNodeCommand = new Command('view')
  .description('Watch public job assignment and queue status for a Nosana node')
  .argument('<node>', 'full node wallet address (not an IP)', parseNodeAddress)
  .addOption(networkOption)
  .addOption(rpcOption)
  .option('--once', 'Show one status update and exit')
  .action(view);
