// DSP conditioning: Savitzky-Golay low-pass FIR smoothing.
// Ports scipy.signal.savgol_filter(window_length=7, polyorder=2) used in
// testz.py SECTION 3. Hardcoded quadratic SG coefficients for the common
// odd windows (5/7/9) with a centered moving-average fallback otherwise.

type SGKernel = number[];

const SG_KERNELS: Record<number, SGKernel> = {
  5: [-3, 12, 17, 12, -3].map((c) => c / 35),
  7: [-2, 3, 6, 7, 6, 3, -2].map((c) => c / 21),
  9: [-21, 14, 39, 54, 59, 54, 39, 14, -21].map((c) => c / 231),
};

function movingAverageKernel(win: number): SGKernel {
  return new Array(win).fill(1 / win);
}

export function savgolSmooth(values: number[], windowLength: number, _polyorder = 2): number[] {
  const n = values.length;
  if (n < windowLength) return values.slice();
  const win = windowLength % 2 === 1 ? windowLength : windowLength - 1;
  if (win < 3) return values.slice();

  const kernel = SG_KERNELS[win] ?? movingAverageKernel(win);
  const half = Math.floor(win / 2);

  // Reflect-pad the ends so the convolution is defined at every index.
  const padded: number[] = new Array(n + 2 * half);
  for (let i = 0; i < half; i++) {
    padded[i] = values[half - i]; // reflect left
    padded[n + half + i] = values[n - 1 - i]; // reflect right
  }
  for (let i = 0; i < n; i++) padded[half + i] = values[i];

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < win; k++) s += padded[i + k] * kernel[k];
    out[i] = s;
  }
  return out;
}

// Picks the same window the Python code would (min(7, len if odd else len-1)).
export function autoSavgol(values: number[]): number[] {
  const n = values.length;
  if (n < 5) return values.slice();
  const candidate = n % 2 === 1 ? n : n - 1;
  const win = Math.min(7, candidate);
  return savgolSmooth(values, win, 2);
}
