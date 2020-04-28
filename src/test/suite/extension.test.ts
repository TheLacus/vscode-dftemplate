/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { Position } from 'vscode';
import { LanguageData } from '../../language/static/languageData';
import { IContext } from '../../extension';
import { Quests } from '../../language/quests';
import { TemplateDefinitionProvider } from '../../providers/definitionProvider';
import { TemplateReferenceProvider } from '../../providers/referenceProvider';
import { TemplateHoverProvider } from '../../providers/hoverProvider';
import { TemplateCompletionItemProvider } from '../../providers/completionItemProvider';

suite('Extension Test Suite', () => {

    let context: IContext;
    let data: LanguageData;
    let quests: Quests;
    let testTextDocument: vscode.TextDocument;
    let completionTextDocument: vscode.TextDocument;
    let token: vscode.CancellationToken;

    suiteSetup(async () => {
        const tablesPath = vscode.workspace.getConfiguration('dftemplate').get<string>('tablesPath');
        if (tablesPath === undefined) {
            throw new Error("Can't run tests if dftemplate.tablesPath is not set.");
        }

        context = {
            subscriptions: [],
            extensionPath: path.join(__dirname, '../../..')
        };
        data = await LanguageData.load(context);
        quests = new Quests(data);
        const suitePath = path.join(context.extensionPath, 'src', 'test', 'suite');
        testTextDocument = await vscode.workspace.openTextDocument(path.join(suitePath, 'TEST.txt'));
        completionTextDocument = await vscode.workspace.openTextDocument(path.join(suitePath, 'COMPLETION.txt'));
        const tokenSource = new vscode.CancellationTokenSource();
        token = tokenSource.token;
    });

    suiteTeardown(() => {
        for (const subscription of context.subscriptions) {
            subscription.dispose();
        }
    });

    test('DefinitionProvider', async () => {
        const provider = new TemplateDefinitionProvider(quests, data);

        const testCases: [Position, Position][] = [
            [new Position(16, 9), new Position(13, 9)],
            [new Position(17, 12), new Position(11, 5)],
            [new Position(18, 8), new Position(4, 10)],
            [new Position(6, 34), new Position(11, 5)]
        ];

        await Promise.all(testCases.map(async ([position, expectedPosition]) => {
            const definitionInfo = await provider.provideDefinition(testTextDocument, position, token) as vscode.Location | undefined;
            if (definitionInfo === undefined) {
                assert.fail('definitionInfo is undefined.');
            }

            assert.strictEqual(definitionInfo.uri.path.toLowerCase(), testTextDocument.uri.path.toLowerCase());
            assert.strictEqual(definitionInfo.range.start.line, expectedPosition.line);
            assert.strictEqual(definitionInfo.range.start.character, expectedPosition.character);
        }));
    });

    test('ReferenceProvider', async () => {
        const provider = new TemplateReferenceProvider(quests);

        const testCases: [Position, Position[]][] = [
            [new Position(6, 34), [new Position(6, 34), new Position(17, 12)]],
            [new Position(13, 9), [new Position(16, 9)]]
        ];

        await Promise.all(testCases.map(async ([position, expectedReferences]) => {
            const references = await provider.provideReferences(testTextDocument, position, { includeDeclaration: false }, token);
            if (references === undefined) {
                assert.fail('references result is undefined.');
            }

            assert.strictEqual(references.length, expectedReferences.length);
            for (let index = 0; index < references.length; index++) {
                const reference = references[index];
                const expectedReference = expectedReferences[index];
                assert.strictEqual(reference.uri.path.toLowerCase(), testTextDocument.uri.path.toLowerCase());
                assert.strictEqual(reference.range.start.line, expectedReference.line);
                assert.strictEqual(reference.range.start.character, expectedReference.character);
            }
        }));
    });

    test('HoverProvider', async () => {
        const provider = new TemplateHoverProvider(data, quests);

        const hover = await provider.provideHover(testTextDocument, new Position(11, 5), token);
        if (hover === undefined) {
            assert.fail('hover is undefined.');
        }

        assert.strictEqual(hover.contents.length, 2);
        assert.strictEqual((hover.contents[0] as vscode.MarkdownString).value, '\n```dftemplate\n(symbol) Item _gold_ gold range 1 to 1\n```\n');
        assert.strictEqual((hover.contents[1] as vscode.MarkdownString).value, 'Item description');
    });

    test('CompletionItemProvider', async () => {
        const provider = new TemplateCompletionItemProvider(data, quests);
        
        const testCases: [Position, string, string?][] = [
            [new Position(1, 1), 'DisplayName: name', 'DisplayName: ${1:name}'],
            [new Position(5, 2), 'Message: id', 'Message:  ${1:1011}'],
            [new Position(10, 18), 'Etiquette'],
            [new Position(11, 7), 'say message', 'say ${1:message}']
        ];

        await Promise.all(testCases.map(async ([position, label, expectedInsertText]) => {
            const items = await provider.provideCompletionItems(completionTextDocument, position, token);
            if (items === undefined) {
                assert.fail(`items result is undefined (${label}).`);
            }

            const item = items.find(x => x.label === label);
            if (item === undefined) {
                assert.fail(`item is undefined (${label}).`);
            }

            if (expectedInsertText !== undefined) {
                if (item.insertText === undefined) {
                    assert.fail(`insertText is undefined (${label}).`);
                }

                assert.strictEqual((item.insertText as vscode.SnippetString).value, expectedInsertText);
            }
        }));
    });
});