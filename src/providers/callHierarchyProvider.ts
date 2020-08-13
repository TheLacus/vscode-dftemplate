/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as vscode from 'vscode';
import { Quests } from '../language/quests';
import { ParameterTypes } from '../language/static/parameterTypes';
import { Quest } from '../language/quest';
import { Parameter, Action, Task } from '../language/common';
import { SymbolType } from '../language/static/common';

type OnParameterCallback = (action: Action, index: number, parameter: Parameter, symbolKind: vscode.SymbolKind) => void;

export class TemplateCallHierarchyProvider implements vscode.CallHierarchyProvider {

    public constructor(private readonly quests: Quests) {
    }

    public prepareCallHierarchy(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CallHierarchyItem | vscode.CallHierarchyItem[]> {
        const quest = this.quests.getIfQuest(document);
        if (quest !== undefined) {
            const resource = quest.getResource(position);
            if (resource !== undefined) {
                if (resource.kind === 'task') {
                    return new vscode.CallHierarchyItem(vscode.SymbolKind.Method, resource.value.name, '', document.uri, resource.value.blockRange, resource.value.range);
                } else if (resource.kind === 'symbol' && resource.value.type === SymbolType.Clock) {
                    const task = quest.qbn.getTask(resource.value.name);
                    if (task !== undefined) {
                        return new vscode.CallHierarchyItem(vscode.SymbolKind.Method, task.name, '', document.uri, task.blockRange, task.range);
                    }
                }
            }
        }
    }

    public async provideCallHierarchyIncomingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyIncomingCall[] | undefined> {
        const document = await vscode.workspace.openTextDocument(item.uri);
        const quest = this.quests.getIfQuest(document);
        if (quest !== undefined) {

            const incomingCalls: vscode.CallHierarchyIncomingCall[] = [];

            for (const task of quest.qbn.iterateTasks(true)) {
                if (task.name !== item.name) {
                    this.checkDirectAssignments(task.actions, (action, index, parameter, symbolKind) => {
                        if (parameter.value === item.name) {
                            const refItem = this.makeDirectAssignment(document, quest, task, action, parameter, symbolKind);
                            if (refItem !== undefined) {
                                incomingCalls.push(new vscode.CallHierarchyIncomingCall(refItem, [action.getRange(index)]));
                            }
                        }
                    });
                } else {
                    this.checkWhenTaskActions(task.actions, (action, index, parameter, symbolKind) => {
                        const refTask = quest.qbn.getTask(parameter.value);
                        if (refTask !== undefined) {
                            const refItem = this.makeWhenTaskAssignment(document, refTask, action, symbolKind);
                            incomingCalls.push(new vscode.CallHierarchyIncomingCall(refItem, [action.getRange(index)]));
                        }
                    });
                }
            }

            return incomingCalls;
        }
    }

    public async provideCallHierarchyOutgoingCalls(item: vscode.CallHierarchyItem, token: vscode.CancellationToken): Promise<vscode.CallHierarchyOutgoingCall[] | undefined> {
        const document = await vscode.workspace.openTextDocument(item.uri);
        const quest = this.quests.getIfQuest(document);
        if (quest !== undefined) {

            const outgoingCalls: vscode.CallHierarchyOutgoingCall[] = [];

            for (const task of quest.qbn.iterateTasks()) {
                if (task.name === item.name) {
                    this.checkDirectAssignments(task.actions, (action, index, parameter, symbolKind) => {
                        const refItem = this.makeDirectAssignment(document, quest, null, action, parameter, symbolKind);
                        if (refItem !== undefined) {
                            outgoingCalls.push(new vscode.CallHierarchyOutgoingCall(refItem, [action.getRange(index)]));
                        }
                    });
                } else {
                    this.checkWhenTaskActions(task.actions, (action, index, parameter, symbolKind) => {
                        if (parameter.value === item.name) {
                            const refItem = this.makeWhenTaskAssignment(document, task, action, symbolKind);
                            outgoingCalls.push(new vscode.CallHierarchyOutgoingCall(refItem, [action.getRange(index)]));
                        }
                    });
                }
            }

            return outgoingCalls;
        }
    }

    private checkDirectAssignments(actions: Action[], onParameter: OnParameterCallback) {
        for (const action of actions) {
            if (action.info.details.sourceName !== 'WhenTask') {
                for (let index = 0; index < action.signature.length; index++) {
                    const parameter = action.signature[index];
                    if (parameter.type === ParameterTypes.task) {
                        onParameter(action, index, parameter, vscode.SymbolKind.Method);
                    } else if (parameter.type === ParameterTypes.clockSymbol) {
                        onParameter(action, index, parameter, vscode.SymbolKind.Property);
                    }
                }
            }
        }
    }

    private makeDirectAssignment(document: vscode.TextDocument, quest: Quest, task: Task | null, action: Action, parameter: Parameter, symbolKind: vscode.SymbolKind) {
        const refTask = task ?? quest.qbn.getTask(parameter.value);
        if (refTask !== undefined) {
            return new vscode.CallHierarchyItem(symbolKind, refTask.name, document.getText(action.blockRange), document.uri, refTask.blockRange, refTask.range);
        }
    }

    private checkWhenTaskActions(actions: Action[], onParameter: OnParameterCallback) {
        for (const action of actions) {
            if (action.info.details.sourceName === 'WhenTask') {
                for (let index = 0; index < action.signature.length; index++) {
                    const parameter = action.signature[index];
                    if (parameter.type === ParameterTypes.task) {
                        onParameter(action, index, parameter, vscode.SymbolKind.Event);
                    }
                }
            }
        }
    }

    private makeWhenTaskAssignment(document: vscode.TextDocument, task: Task, action: Action, symbolKind: vscode.SymbolKind) {
        return new vscode.CallHierarchyItem(symbolKind, task.name, document.getText(action.blockRange), document.uri, task.blockRange, task.range);
    }
}