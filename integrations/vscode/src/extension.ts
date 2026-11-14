import * as vscode from 'vscode';
import { execFile } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  const cmd = vscode.commands.registerCommand('promptpilot.enhance', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor.');
      return;
    }

    const selection = editor.selection;
    const text = editor.document.getText(selection).trim();
    if (!text) {
      vscode.window.showInformationMessage('Select a prompt to enhance.');
      return;
    }

    const profile = await vscode.window.showQuickPick(
      [
        { label: 'Auto-detect', value: '' },
        { label: 'Quick Fix', value: 'quick-fix' },
        { label: 'Feature Dev', value: 'feature-dev' },
        { label: 'UI/UX Redesign', value: 'ui-ux-redesign' },
        { label: 'Debugging', value: 'debugging' },
        { label: 'Code Refactoring', value: 'code-refactoring' },
        { label: 'Performance', value: 'performance-optimization' },
        { label: 'Security Review', value: 'security-review' },
        { label: 'Testing', value: 'testing' },
        { label: 'Documentation', value: 'documentation' }
      ],
      { placeHolder: 'Pick a PromptPilot profile (or auto-detect)' }
    );
    if (!profile) return; // cancelled

    const args = ['enhance', text];
    if (profile.value) {
      args.push('--profile', profile.value);
    }

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Enhancing prompt…' },
      () =>
        new Promise<void>((resolve) => {
          execFile('promptpilot', args, { timeout: 30_000 }, (err: Error | null, stdout: string, stderr: string) => {
            if (err) {
              // Fall back to npx if the binary isn't installed globally
              execFile(
                'npx',
                ['--yes', '@promptpilot/cli', ...args],
                { timeout: 60_000 },
                (err2: Error | null, stdout2: string) => {
                  if (err2) {
                    vscode.window.showErrorMessage(
                      `PromptPilot failed: ${stderr || err2.message}`
                    );
                    resolve();
                    return;
                  }
                  showResult(editor, selection, stdout2.trim());
                  resolve();
                }
              );
              return;
            }
            showResult(editor, selection, stdout.trim());
            resolve();
          });
        })
    );
  });
  context.subscriptions.push(cmd);
}

function showResult(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  enhanced: string
) {
  const doc = vscode.workspace.openTextDocument({ content: enhanced, language: 'markdown' });
  doc.then((d) => vscode.window.showTextDocument(d, vscode.ViewColumn.Beside));
  // Also copy to clipboard for pasting into the AI chat
  vscode.env.clipboard.writeText(enhanced);
  vscode.window.showInformationMessage('Enhanced prompt copied to clipboard.');
}

export function deactivate() {}

