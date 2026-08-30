'use client';

import { useMemo } from 'react';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { CircleAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useIsHydrated } from '@/hooks/useIsHydrated';

export function JsonEditor({
  label,
  value,
  onChange,
  errors,
  height = '360px',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors: string[];
  height?: string;
}) {
  const { resolvedTheme } = useTheme();
  const isHydrated = useIsHydrated();
  const appearance = isHydrated ? resolvedTheme ?? 'light' : 'light';
  const schemaLinter = useMemo(
    () =>
      linter((view) => {
        if (errors.length === 0) return [];
        const end = Math.min(Math.max(view.state.doc.length, 1), 2);
        return errors.map<Diagnostic>((message) => ({
          from: 0,
          to: end,
          severity: 'error',
          message,
        }));
      }),
    [errors],
  );
  const extensions = useMemo(
    () => [
      json(),
      lintGutter(),
      linter(jsonParseLinter()),
      schemaLinter,
      EditorView.contentAttributes.of({ 'aria-label': label }),
    ],
    [label, schemaLinter],
  );

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border bg-background">
        <CodeMirror
          aria-label={label}
          value={value}
          height={height}
          theme={appearance === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: false,
          }}
          className="text-sm [&_.cm-editor]:outline-none [&_.cm-scroller]:font-mono"
        />
      </div>
      {errors.length > 0 ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 space-y-1">
            <div className="font-medium">JSON validation failed</div>
            <ul className="space-y-0.5">
              {errors.map((error, index) => (
                <li
                  key={`${index}-${error}`}
                  className="break-words font-mono text-xs"
                >
                  {error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
