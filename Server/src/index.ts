import path from 'node:path';
import { createGame } from './game';
import { listen } from './http';

const file = process.env.DATA_FILE || path.join(process.cwd(), 'data', 'game.json');
const port = Number(process.env.PORT) || 3000;
const game = createGame(file);

listen(game, port, '0.0.0.0').then((server) => {
  const address = server.address();
  const real = typeof address === 'object' && address ? address.port : port;
  console.log(`listening ${real}`);
});
