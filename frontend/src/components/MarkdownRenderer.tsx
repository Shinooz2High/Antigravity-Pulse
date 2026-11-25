import React, { Component, type ReactNode, useEffect, useId, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';
import { Check, Code2, Copy, AlertTriangle } from 'lucide-react';
import { copyToClipboard, cn } from '../lib/utils';

let lastMermaidTheme: string | null = null;

function ensureMermaidInit(isDark: boolean) {
  const theme = isDark ? 'dark' : 'default';
  if (lastMermaidTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme,
      fontFamily: 'inherit',
    });
    lastMermaidTheme = theme;
  }
}

function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join('');
  }
  if (React.isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return '';
}

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

class MermaidErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function MermaidDiagram({ chart, isDark }: { chart: string; isDark: boolean }) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function renderChart() {
      if (!chart.trim()) return;
      try {
        ensureMermaidInit(isDark);
        const renderId = `mmd_${rawId}_${Date.now()}`;
        const result = await mermaid.render(renderId, chart);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể dựng sơ đồ Mermaid');
        }
      }
    }
    renderChart();
    return () => {
      cancelled = true;
    };
  }, [chart, isDark, rawId]);

  if (error || showSource) {
    return (
      <div className="my-3 overflow-hidden rounded-xl border border-slate-300/60 bg-slate-950/90 dark:border-slate-700/80">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 font-medium">
            {error ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                <span>Mermaid (hiển thị mã nguồn)</span>
              </>
            ) : (
              <>
                <Code2 className="h-3.5 w-3.5 text-cyan-400" />
                <span>Mã Mermaid</span>
              </>
            )}
          </span>
          {!error && (
            <button
              type="button"
              onClick={() => setShowSource(false)}
              className="rounded-md bg-slate-800 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-slate-700"
            >
              Xem sơ đồ
            </button>
          )}
        </div>
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-200">
          <code>{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-[#0d1322]">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="font-mono uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
          mermaid
        </span>
        <button
          type="button"
          onClick={() => setShowSource(true)}
          className="rounded px-2 py-0.5 text-[11px] hover:bg-slate-200/60 dark:hover:bg-slate-800"
        >
          Xem mã
        </button>
      </div>
      {svg ? (
        <div
          className="overflow-x-auto p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="p-4 text-center text-xs text-slate-400">Đang dựng sơ đồ...</div>
      )}
    </div>
  );
}

function CodeBlock({
  language,
  codeText,
  children,
}: {
  language: string;
  codeText: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(codeText);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-[#0d1117] text-slate-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800/90 bg-[#131924] px-3 py-1.5 text-xs">
        <span className="font-mono text-[11px] uppercase tracking-wider text-cyan-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-[28px] items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Chép</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

interface MarkdownRendererProps {
  content: string;
  isDark?: boolean;
  className?: string;
}

export function MarkdownRenderer({
  content,
  isDark = true,
  className,
}: MarkdownRendererProps) {
  const components: Components = {
    h1: ({ children }) => (
      <h1 className="mt-4 mb-2 border-b border-slate-200 pb-1.5 text-xl font-bold text-slate-900 dark:border-slate-800 dark:text-white">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-4 mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-3 mb-1.5 text-base font-semibold text-slate-800 dark:text-slate-100">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="my-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 rounded-r-lg border-l-4 border-cyan-500 bg-cyan-500/5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-cyan-600 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-500 dark:text-cyan-400"
      >
        {children}
      </a>
    ),
    hr: () => <hr className="my-4 border-slate-200 dark:border-slate-800" />,
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-800">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-slate-100/80 text-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
        {children}
      </thead>
    ),
    th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
    td: ({ children }) => (
      <td className="border-t border-slate-200/70 px-3 py-2 text-slate-700 dark:border-slate-800/70 dark:text-slate-300">
        {children}
      </td>
    ),
    pre: ({ children }) => {
      const child = React.Children.toArray(children)[0];
      if (React.isValidElement<{ className?: string; children?: ReactNode }>(child)) {
        const cls = child.props.className || '';
        const match = /language-([a-zA-Z0-9_+-]+)/.exec(cls);
        const lang = match?.[1]?.toLowerCase() ?? '';
        const rawText = extractText(child.props.children).replace(/\n$/, '');

        if (lang === 'mermaid') {
          return (
            <MermaidErrorBoundary
              fallback={
                <CodeBlock language="mermaid" codeText={rawText}>
                  <code className={cls}>{rawText}</code>
                </CodeBlock>
              }
            >
              <MermaidDiagram chart={rawText} isDark={isDark} />
            </MermaidErrorBoundary>
          );
        }

        return (
          <CodeBlock language={lang} codeText={rawText}>
            {child}
          </CodeBlock>
        );
      }
      return (
        <pre className="my-3 overflow-x-auto rounded-xl border border-slate-800 bg-[#0d1117] p-3 text-xs text-slate-100">
          {children}
        </pre>
      );
    },
    code: ({ className: codeClass, children, ...rest }) => {
      const isBlock = Boolean(codeClass && (codeClass.includes('language-') || codeClass.includes('hljs')));
      if (isBlock) {
        return (
          <code className={cn('font-mono text-[13px]', codeClass)} {...rest}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded-md bg-slate-200/80 px-1.5 py-0.5 font-mono text-[12.5px] text-cyan-700 dark:bg-slate-800 dark:text-cyan-300"
          {...rest}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div className={cn('agy-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { ignoreMissing: true, plainText: ['mermaid'] }],
        ]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
