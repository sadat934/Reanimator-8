// Self-healing loop (reanimator.md section 7): generate -> compile -> test -> repair, max 3 attempts.
//
// Safety: the model's reply is only ever treated as text. It goes to the Octo compiler and the
// resulting bytes run inside our own emulator via the headless harness. It is never eval'd.
//
// Honesty: if the provider says its answer is an offline stand-in (flag or name "mock"/"offline"),
// the progress log and the result say so and never claim the program was generated just now.
import { compile } from '../compiler/compile';
import { runHeadless } from '../harness/headless';
import type { HarnessReport } from '../harness/headless';
import {
  buildRepairMessage,
  buildSystemPrompt,
  buildUserMessage,
  sanitizeUserText,
  stripFences,
} from '../llm/prompt';
import type { GenerateInput } from '../llm/types';

export const MAX_ATTEMPTS = 3;
export const MAX_TOKENS = 4096;
export const OFFLINE_NOTICE = 'offline stand-in, not generated just now';
export const SIMPLER_PROMPT_HINT =
  'Try a simpler prompt, for example one object that moves and one clear goal.';

/** What the loop needs from a provider. The real ProviderChain satisfies it. */
export interface ReanimateProvider {
  generate(input: GenerateInput): Promise<{
    text: string;
    provider: string;
    /** True when the answer is a canned/offline stand-in rather than a live model reply. */
    offline?: boolean;
  }>;
}

export type ProgressKind =
  | 'start'
  | 'generating'
  | 'provider'
  | 'compile-error'
  | 'test-failed'
  | 'repairing'
  | 'success'
  | 'failure';

export interface ProgressEvent {
  /** 1-based attempt number, or 0 for events outside any attempt. */
  attempt: number;
  kind: ProgressKind;
  /** One line of terminal text, safe to show to the user. */
  message: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ReanimateOptions {
  provider: ReanimateProvider;
  onProgress?: ProgressCallback;
  /** Defaults to buildSystemPrompt(). Must not contain user text. */
  systemPrompt?: string;
}

export interface ReanimateSuccess {
  ok: true;
  source: string;
  rom: Uint8Array;
  report: HarnessReport;
  attempts: number;
  provider: string;
  /** True when the result came from an offline stand-in, not a live model. */
  offline: boolean;
  /** Plain-language origin: "generated just now by <provider>" or the offline notice. */
  origin: string;
  log: ProgressEvent[];
}

export interface ReanimateFailure {
  ok: false;
  attempts: number;
  /** Honest, user-facing message, including a simpler-prompt suggestion where it applies. */
  message: string;
  /** The last problem seen (compile error, test report lines, or provider error). */
  lastProblem: string;
  lastSource: string | null;
  provider: string | null;
  offline: boolean;
  log: ProgressEvent[];
}

export type ReanimateResult = ReanimateSuccess | ReanimateFailure;

const isOffline = (r: { provider: string; offline?: boolean }): boolean =>
  r.offline === true || /^(mock|offline)/i.test(r.provider);

/** Runs the loop. Never throws for provider, compile or test problems: they come back as data. */
export async function reanimate(userText: string, options: ReanimateOptions): Promise<ReanimateResult> {
  const log: ProgressEvent[] = [];
  const emit = (attempt: number, kind: ProgressKind, message: string): void => {
    const event: ProgressEvent = { attempt, kind, message };
    log.push(event);
    options.onProgress?.(event);
  };
  const fail = (
    attempts: number,
    message: string,
    lastProblem: string,
    lastSource: string | null,
    provider: string | null,
    offline: boolean,
  ): ReanimateFailure => {
    emit(attempts, 'failure', message);
    return { ok: false, attempts, message, lastProblem, lastSource, provider, offline, log };
  };

  const request = sanitizeUserText(userText);
  if (request === '') {
    return fail(0, 'The prompt is empty. Describe the game in a sentence.', 'empty prompt', null, null, false);
  }

  const system = options.systemPrompt ?? buildSystemPrompt();
  emit(0, 'start', `Reanimating: "${request}"`);

  let user = buildUserMessage(request);
  let lastProblem = '';
  let lastSource: string | null = null;
  let lastProvider: string | null = null;
  let lastOffline = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    emit(attempt, 'generating', `Attempt ${attempt}: asking the model for Octo source...`);

    let text: string;
    try {
      const reply = await options.provider.generate({ system, user, maxTokens: MAX_TOKENS });
      text = reply.text;
      lastProvider = reply.provider;
      lastOffline = isOffline(reply);
    } catch (err) {
      // No provider answered. Retrying would not help, so stop with the provider's own message.
      const reason = err instanceof Error ? err.message : String(err);
      return fail(attempt, `Attempt ${attempt}: no model answered. ${reason}`, reason, lastSource, lastProvider, lastOffline);
    }

    emit(
      attempt,
      'provider',
      lastOffline
        ? `Attempt ${attempt}: served by "${lastProvider}", an ${OFFLINE_NOTICE}. No live model wrote this.`
        : `Attempt ${attempt}: generated just now by ${lastProvider}.`,
    );

    const source = stripFences(text);
    lastSource = source;

    // Step 2: compile.
    const compiled = source === '' ? null : compile(source);
    if (compiled === null || !compiled.ok) {
      const error = compiled === null ? undefined : compiled.errors[0];
      const problem =
        compiled === null
          ? 'The reply was empty. Return the complete Octo program.'
          : `Compile error${error?.line != null ? ` on line ${error.line}` : ''}: ${error?.message ?? 'unknown error'}`;
      lastProblem = problem;
      const where = error?.line != null ? ` on line ${error.line}` : '';
      if (attempt < MAX_ATTEMPTS) {
        emit(attempt, 'compile-error', `Attempt ${attempt}: compile error${where}, repairing...`);
        emit(attempt, 'repairing', `Attempt ${attempt}: sending the error back to the model.`);
        user = buildRepairMessage(request, source, problem);
        continue;
      }
      emit(attempt, 'compile-error', `Attempt ${attempt}: compile error${where}, no attempts left.`);
      break;
    }

    // Step 3 and 4: run headlessly and check the report.
    const report = runHeadless(compiled.rom);
    if (report.passed) {
      const origin = lastOffline ? OFFLINE_NOTICE : `generated just now by ${lastProvider}`;
      emit(
        attempt,
        'success',
        `Attempt ${attempt}: compiled (${compiled.rom.length} bytes) and passed the ${report.framesRun}-frame test. It lives! (${origin})`,
      );
      return {
        ok: true,
        source,
        rom: compiled.rom,
        report,
        attempts: attempt,
        provider: lastProvider as string,
        offline: lastOffline,
        origin,
        log,
      };
    }

    const problem = `The program compiled but failed the headless test:\n${report.failures.map((f) => `- ${f}`).join('\n')}`;
    lastProblem = report.failures.join(' ');
    const summary = report.failures[0] ?? 'the test failed';
    if (attempt < MAX_ATTEMPTS) {
      emit(attempt, 'test-failed', `Attempt ${attempt}: test failed (${summary}) repairing...`);
      emit(attempt, 'repairing', `Attempt ${attempt}: sending the test report back to the model.`);
      user = buildRepairMessage(request, source, problem);
    } else {
      emit(attempt, 'test-failed', `Attempt ${attempt}: test failed (${summary}) no attempts left.`);
    }
  }

  const who = lastOffline ? ` The answers came from an ${OFFLINE_NOTICE}.` : '';
  return fail(
    MAX_ATTEMPTS,
    `The experiment failed after ${MAX_ATTEMPTS} attempts. Last problem: ${lastProblem}${who} ${SIMPLER_PROMPT_HINT}`,
    lastProblem,
    lastSource,
    lastProvider,
    lastOffline,
  );
}
