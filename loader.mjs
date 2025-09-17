import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

process.on('uncaughtException', (e) => console.error('Loader error', e));
register('ts-node/esm', pathToFileURL('./'));
