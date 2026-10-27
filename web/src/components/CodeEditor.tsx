import { useEffect, useRef } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Colores del editor alineados con la variante Onyx. */
const onyxHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#7f7f7f", fontStyle: "italic" },
  { tag: tags.keyword, color: "#c9a0ff" },
  { tag: [tags.bool, tags.null], color: "#f0a8a1" },
  { tag: [tags.number, tags.integer, tags.float], color: "#f0c674" },
  { tag: [tags.string, tags.special(tags.string)], color: "#a8d8a8" },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: "#9ecbff" },
  { tag: tags.className, color: "#f0c674" },
  { tag: tags.operator, color: "#d6d6d6" },
  { tag: tags.propertyName, color: "#ececec" },
  { tag: tags.variableName, color: "#ececec" },
  { tag: tags.bracket, color: "#b0b0b0" },
  { tag: tags.invalid, color: "#f0a8a1" },
]);

const onyxTheme = EditorView.theme(
  {
    "&": {
      color: "#ececec",
      backgroundColor: "transparent",
      fontSize: "16px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: "1.6",
      maxHeight: "420px",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "10px 0",
      caretColor: "#ffffff",
      minHeight: "180px",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#7a7a7a",
      border: "none",
      paddingLeft: "4px",
    },
    ".cm-activeLine": { backgroundColor: "#ffffff0a" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#d6d6d6" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#3a3a3a",
    },
    ".cm-cursor": { borderLeftColor: "#ffffff" },
    ".cm-placeholder": { color: "#7a7a7a" },
    ".cm-tooltip": {
      backgroundColor: "#303030",
      border: "1px solid #3f3f3f",
      color: "#ececec",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#3f3f3f",
      color: "#ffffff",
    },
  },
  { dark: true },
);

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Etiqueta accesible del area de texto. */
  ariaLabel?: string;
  readOnly?: boolean;
}

/**
 * Editor de codigo Python sobre CodeMirror 6: resaltado de sintaxis, numeros de
 * linea, autocompletado de Python, cierre de parentesis y Tab/Shift+Tab para
 * indentar. El valor es controlado: los cambios externos sustituyen el
 * documento sin recrear la vista.
 */
export function CodeEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  readOnly = false,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // El callback cambia de identidad en cada render; el listener usa el ultimo.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          indentOnInput(),
          python(),
          syntaxHighlighting(onyxHighlight),
          onyxTheme,
          keymap.of([
            // Tab indenta (y Shift+Tab desindenta) en vez de mover el foco.
            indentWithTab,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel ?? "Editor de código",
            "aria-multiline": "true",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          EditorView.editable.of(!readOnly),
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          ...(placeholder ? [placeholderExtension(placeholder)] : []),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // La vista se crea una vez; el valor inicial solo cuenta al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Valor controlado: si cambia desde fuera (p. ej. al cargar), se reemplaza.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      className="focus-within:border-onyx-inkFaint/60 overflow-hidden rounded-lg border border-onyx-line bg-onyx-surface transition-colors duration-150"
    />
  );
}

export default CodeEditor;
