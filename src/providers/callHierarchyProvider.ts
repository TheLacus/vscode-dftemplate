/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as vscode from 'vscode';
import {
    CallHierarchyProvider,
    CallHierarchyItem,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    Position,
    CancellationToken
} from "vscode";
import { Quests } from '../language/quests';
import { Quest } from '../language/quest';
import { TemplateReferenceProvider } from './referenceProvider';

export class TemplateCallHierarchyProvider implements CallHierarchyProvider {
    
    public constructor(private readonly quests: Quests) {
    }
    
    public async prepareCallHierarchy(document: vscode.TextDocument, position: Position, token: CancellationToken): Promise<CallHierarchyItem | undefined> {
        let quest: Quest | undefined = undefined;

        if (Quests.isTable(document.uri)) {
            quest = await this.quests.findFromTable(document, position, token);
        } else {
            const current = this.quests.get(document);
            const questName = current.preamble.questName;
            if (questName !== undefined && questName.valueRange.contains(position)) {
                quest = current;
            } else {
                const resource = current.getResource(position);
                if (resource !== undefined && resource.kind === 'quest') {
                    quest = await this.quests.find(resource.value, token);
                }
            }
        }

        if (quest !== undefined) {
            return this.makeQuestItem(quest);
        }
    }

    public async provideCallHierarchyIncomingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyIncomingCall[] | undefined> {
        const items: CallHierarchyIncomingCall[] = [];
        
        for (const location of await TemplateReferenceProvider.questReferences(this.quests, item.name, false, token)) {    
            const caller = items.find(x => x.from.uri === location.uri);
            if (caller !== undefined) {
                caller.fromRanges.push(location.range);
            } else {
                const quest = this.quests.get(await vscode.workspace.openTextDocument(location.uri));
                const caller = this.makeQuestItem(quest);
                if (caller !== undefined) {
                    items.push(new CallHierarchyIncomingCall(caller, [location.range]));
                }
            }

            if (token.isCancellationRequested) {
                break;
            }
        }

        return items;
    }
    
    public async provideCallHierarchyOutgoingCalls(item: CallHierarchyItem, token: CancellationToken): Promise<CallHierarchyOutgoingCall[] | undefined> {
        const quest = this.quests.get(await vscode.workspace.openTextDocument(item.uri));
        if (quest.qbn.range !== undefined) {

            const items: CallHierarchyOutgoingCall[] = [];
            
            for (const action of quest.qbn.iterateActions()) {
                if (action.signature.length >= 3 && action.signature[0].value === 'start' && action.signature[1].value === 'quest') {
                    const name = Quest.indexToName(action.signature[2].value);
                    const call = items.find(x => x.to.name === name);
                    if (call !== undefined) {
                        call.fromRanges.push(action.blockRange);
                    } else {
                        const target = await this.quests.find(name, token);
                        if (target !== undefined) {
                            const item = this.makeQuestItem(target);
                            if (item !== undefined) {
                                items.push(new CallHierarchyOutgoingCall(item, [action.blockRange]));
                            }
                        }
                    }

                    if (token.isCancellationRequested) {
                        break;
                    }
                }
            }

            return items;
        }
    }

    private makeQuestItem(quest: Quest): CallHierarchyItem | undefined {
        const questName = quest.preamble.questName;
        if (questName !== undefined) {
            return {
                kind: vscode.SymbolKind.Class,
                name: quest.name,
                detail: quest.preamble.getDisplayName(),
                range: questName.blockRange,
                selectionRange: questName.valueRange,
                uri: quest.document.uri
            };
        }
    }
}