/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parser';
import { ReferenceProvider, TextDocument, Position, Location, CancellationToken, Range } from 'vscode';
import { Quest } from '../language/quest';
import { Symbol, Message, Task } from '../language/common';
import { SymbolType, ActionInfo } from '../language/static/common';
import { ParameterTypes } from '../language/static/parameterTypes';
import { wordRange } from '../parser';
import { Quests } from '../language/quests';

export class TemplateReferenceProvider implements ReferenceProvider {

    public constructor(private readonly quests: Quests) {
    }

    public async provideReferences(document: TextDocument, position: Position, options: { includeDeclaration: boolean }, token: CancellationToken): Promise<Location[] | undefined> {
        if (Quests.isTable(document.uri)) {
            const quest = await this.quests.findFromTable(document, position, token);
            if (quest !== undefined) {
                const name = quest.getName();
                if (name) {
                    return TemplateReferenceProvider.questReferences(this.quests, name, options.includeDeclaration, token);
                }
            }

            return undefined;
        }

        const quest = this.quests.get(document);
        const resource = quest.getResource(position);
        if (resource) {
            switch (resource.kind) {
                case 'message':
                    return TemplateReferenceProvider.messageReferences(quest, resource.value, options.includeDeclaration);
                case 'macro':
                    return TemplateReferenceProvider.workspaceSymbolMacroReferences(this.quests, resource.value, token);
                case 'symbol':
                    return TemplateReferenceProvider.symbolReferences(quest, resource.value, options.includeDeclaration);
                case 'task':
                    return TemplateReferenceProvider.taskReferences(quest, resource.value, options.includeDeclaration);
                case 'action':
                    return TemplateReferenceProvider.workspaceActionReferences(this.quests, resource.value.info, token);
                case 'quest':
                    return TemplateReferenceProvider.questReferences(this.quests, resource.value, options.includeDeclaration, token);
                case 'globalVar':
                    return TemplateReferenceProvider.globalVarReferences(this.quests, resource.value, token);
            }
        }
    }

    public static messageReferences(quest: Quest, message: Message, includeDeclaration: boolean = true): Location[] {
        const locations: Location[] = [];

        // Definition
        if (includeDeclaration) {
            locations.push(quest.getLocation(message.range));
        }

        // Actions
        for (const action of quest.qbn.iterateActions()) {
            for (const parameter of action.signature) {
                if (parameter.type === ParameterTypes.message || parameter.type === ParameterTypes.messageID) {
                    if (Number(parameter.value) === message.id) {
                        locations.push(quest.getLocation(action.getRange(parameter)));
                    }
                }

                if (parameter.type === ParameterTypes.message || parameter.type === ParameterTypes.messageName) {
                    if (parameter.value === message.alias) {
                        locations.push(quest.getLocation(action.getRange(parameter)));
                    }
                }
            }
        }

        return locations;
    }

    public static typeReferences(quest: Quest, type: SymbolType): Location[] {
        const locations: Location[] = [];

        for (const symbol of quest.qbn.iterateSymbols()) {
            if (symbol.type === type) {
                locations.push(quest.getLocation(wordRange(symbol.line, type)));
            }
        }

        return locations;
    }

    public static symbolReferences(quest: Quest, symbol: Symbol, includeDeclaration: boolean = true): Location[] {
        const locations: Location[] = [];

        // Messages
        const regex = parser.symbols.makeSymbolRegex(symbol.name);
        for (const line of quest.qrc.iterateMessageLines()) {
            let match: RegExpExecArray | null;
            while (match = regex.exec(line.text)) {
                locations.push(quest.getLocation(new Range(line.lineNumber, match.index, line.lineNumber, match.index + match[0].length)));
            }
        }

        // Definition
        if (includeDeclaration) {
            locations.push(quest.getLocation(symbol.range));
        }

        // Actions
        const baseSymbol = parser.symbols.getBaseSymbol(symbol.name);
        for (const action of quest.qbn.iterateActions()) {
            for (const parameter of action.signature) {
                if (parameter.value === baseSymbol) {
                    locations.push(quest.getLocation(action.getRange(parameter)));
                }
            }
        }

        // Clock task
        const task = quest.qbn.getTask(symbol.name);
        if (task) {
            locations.push(quest.getLocation(task.range));
        }

        return locations;
    }

    public static taskReferences(quest: Quest, task: Task, includeDeclaration: boolean = true): Location[] {
        const locations: Location[] = [];

        // Definition
        if (includeDeclaration) {
            locations.push(quest.getLocation(task.range));
        }

        // UntilPerformed
        for (const untilPerformed of quest.qbn.persistUntilTasks.filter(x => x.definition.symbol === task.definition.symbol)) {
            locations.push(quest.getLocation(untilPerformed.range));
        }

        // Actions
        for (const action of quest.qbn.iterateActions()) {
            for (const parameter of action.signature) {
                if (parameter.type === ParameterTypes.task && parameter.value === task.definition.symbol) {
                    locations.push(quest.getLocation(action.getRange(parameter)));
                }
            }
        }

        return locations;
    }

    public static actionReferences(quest: Quest, actionInfo: ActionInfo): Location[] {
        const locations: Location[] = [];

        let name: string | undefined = undefined;
        for (const other of quest.qbn.iterateActions()) {
            if (actionInfo.isSameAction(other.info)) {
                if (name === undefined) {
                    name = other.getName();
                }

                locations.push(quest.getLocation(wordRange(other.line, name)));
            }
        }

        return locations;
    }

    public static async workspaceActionReferences(quests: Quests, actionInfo: ActionInfo, token?: CancellationToken): Promise<Location[]> {
        const locations: Location[] = [];

        for (const quest of await quests.getAll(token)) {
            locations.push(...TemplateReferenceProvider.actionReferences(quest, actionInfo));
        }

        return locations;
    }

    public static symbolMacroReferences(quest: Quest, symbol: string): Location[] {
        const locations: Location[] = [];

        for (const macro of quest.qrc.macros) {
            if (macro.symbol === symbol) {
                locations.push(quest.getLocation(macro.range));
            }
        }

        return locations;
    }

    public static async workspaceSymbolMacroReferences(quests: Quests, symbol: string, token?: CancellationToken): Promise<Location[]> {
        const locations: Location[] = [];

        for (const quest of await quests.getAll(token)) {
            locations.push(...TemplateReferenceProvider.symbolMacroReferences(quest, symbol));
        }

        return locations;
    }

    public static async questReferences(quests: Quests, questNameOrId: string, includeDeclaration: boolean = true, token?: CancellationToken): Promise<Location[]> {
        const locations: Location[] = [];

        if (includeDeclaration) {
            const quest = await quests.find(questNameOrId, token);
            if (quest !== undefined) {
                locations.push(quest.getNameLocation());
            }
        }

        questNameOrId = Quest.indexToName(questNameOrId);
        for (const quest of await quests.getAll(token)) {
            for (const action of quest.qbn.iterateActions()) {
                for (const parameter of action.signature) {
                    if (parameter.type === ParameterTypes.questName) {
                        if (parameter.value === questNameOrId) {
                            locations.push(quest.getLocation(action.getRange(parameter)));
                        }
                    } else if (parameter.type === ParameterTypes.questID) {
                        if (Quest.indexToName(parameter.value) === questNameOrId) {
                            locations.push(quest.getLocation(action.getRange(parameter)));
                        }
                    }
                }
            }
        }

        return locations;
    }

    public static async globalVarReferences(quests: Quests, name: string, token?: CancellationToken): Promise<Location[]> {
        const locations: Location[] = [];

        for (const quest of await quests.getAll(token)) {
            for (const other of quest.qbn.iterateTasks()) {
                const globalVarName = other.definition.globalVarName;
                if (globalVarName && name === globalVarName) {
                    locations.push(quest.getLocation(wordRange(quest.document.lineAt(other.range.start.line), globalVarName)));
                }
            }
        }

        return locations;
    }
}