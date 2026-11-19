import { TEST_ROM } from './emulator';
import { startRenderer } from './ui/renderer';

const canvas = document.getElementById('screen');
const statusEl = document.getElementById('status');
if (canvas instanceof HTMLCanvasElement && statusEl) {
  startRenderer({ canvas, statusEl, rom: TEST_ROM });
}
