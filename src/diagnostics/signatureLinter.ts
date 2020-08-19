/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as vscode from 'vscode';
import { Diagnostic } from 'vscode';
import { SymbolType } from '../language/static/common';
import { Errors } from './common';
import { ParameterTypes } from '../language/static/parameterTypes';
import { Parameter, SingleLineQuestResource } from '../language/common';
import { Quest } from '../language/quest';
import { LanguageData } from '../language/static/languageData';

export class SignatureLinter {
    public constructor(private readonly data: LanguageData) {
    }

    /**
     * Finds issues with the signature of a resource.
     * @param quest The quest that contains the given resource.
     * @param resource A resource with a list of parameters.
     */
    public analyseSignature(quest: Quest, resource: SingleLineQuestResource): Diagnostic[] {
        if (resource.signature === undefined) {
            throw new Error('Signature is undefined.');
        }
        
        return resource.signature.reduce<Diagnostic[]>((diagnostics, parameter) => {
            const diagnostic = this.analyseParameter(quest, parameter, resource.getRange(parameter));
            if (diagnostic !== undefined) {
                diagnostics.push(diagnostic);
            }

            return diagnostics;
        }, []);
    }

    /**
     * Finds issues with a parameter inside the signature of a resource.
     * @param quest The quest that contains the given parameter.
     * @param parameter A parameter to analyse.
     * @param range The range of the parameter in the text document.
     */
    private analyseParameter(quest: Quest, parameter: Parameter, range: vscode.Range): vscode.Diagnostic | undefined {
        switch (parameter.type) {
            case ParameterTypes.naturalNumber:
                if (isNaN(Number(parameter.value))) {
                    return Errors.notANumber(range, parameter.value);
                } else if (parameter.value.startsWith('+') || parameter.value.startsWith('-')) {
                    return Errors.numberIsNotNatural(range, parameter.value);
                }
                break;
            case ParameterTypes.integerNumber:
                if (isNaN(Number(parameter.value))) {
                    return Errors.notANumber(range, parameter.value);
                } else if (!parameter.value.startsWith('+') && !parameter.value.startsWith('-')) {
                    return Errors.numberIsNotInteger(range, parameter.value);
                }
                break;
            case ParameterTypes.time:
                const time = parameter.value.split(':');
                if (Number(time[0]) > 23 || Number(time[1]) > 59) {
                    return Errors.incorrectTime(range, parameter.value);
                }
                break;
            case ParameterTypes.message:
                if (!isNaN(Number(parameter.value))) {
                    if (!quest.qrc.messages.find(x => x.id === Number(parameter.value))) {
                        return Errors.undefinedMessage(range, parameter.value);
                    }
                }
                else {
                    const id = this.data.tables.staticMessagesTable.messages.get(parameter.value);
                    if (!id || !quest.qrc.messages.find(x => x.id === id)) {
                        return Errors.undefinedMessage(range, parameter.value);
                    }
                }
                break;
            case ParameterTypes.messageName:
                const id = this.data.tables.staticMessagesTable.messages.get(parameter.value);
                if (!id || !quest.qrc.messages.find(x => x.id === Number(parameter.value))) {
                    return Errors.undefinedMessage(range, parameter.value);
                }
                break;
            case ParameterTypes.messageID:
                if (!quest.qrc.messages.find(x => x.id === Number(parameter.value))) {
                    return Errors.undefinedMessage(range, parameter.value);
                }
                break;
            case ParameterTypes.symbol:
                if (!quest.qbn.symbols.has(parameter.value)) {
                    return Errors.undefinedSymbol(range, parameter.value);
                }
                break;
            case ParameterTypes.itemSymbol:
                return this.checkType(quest, parameter.value, SymbolType.Item, range);
            case ParameterTypes.personSymbol:
                return this.checkType(quest, parameter.value, SymbolType.Person, range);
            case ParameterTypes.placeSymbol:
                return this.checkType(quest, parameter.value, SymbolType.Place, range);
            case ParameterTypes.clockSymbol:
                return this.checkType(quest, parameter.value, SymbolType.Clock, range);
            case ParameterTypes.foeSymbol:
                return this.checkType(quest, parameter.value, SymbolType.Foe, range);
            case ParameterTypes.task:
                if (!quest.qbn.tasks.has(parameter.value)) {
                    return Errors.undefinedTask(range, parameter.value);
                }
                break;
            case ParameterTypes.effectKey:
                if (!this.data.modules.effectKeyExists(parameter.value)) {
                    return Errors.undefinedAttribute(range, parameter.value, parameter.type.replace('${', '').replace('}', ''));
                }
                break;
        }

        const attributes = this.data.tables.getValues(parameter.type);
        if (attributes && attributes.indexOf(parameter.value) === -1) {
            return Errors.undefinedAttribute(range, parameter.value, parameter.type.replace('${', '').replace('}', ''));
        }
    }

    /**
     * Checks that a symbol is defined and is defined as the correct type.
     * @param document A quest document.
     * @param symbol A symbol referenced inside an invocation.
     * @param type The type of the symbol as requested by signature.
     */
    private checkType(context: Quest, symbol: string, type: string, range: vscode.Range): vscode.Diagnostic | undefined {
        const symbolContext = context.qbn.symbols.get(symbol);
        if (!symbolContext) {
            return Errors.undefinedSymbol(range, symbol);
        }
        else if ((Array.isArray(symbolContext) ? symbolContext[0] : symbolContext).type !== type) {
            return Errors.incorrectSymbolType(range, symbol, type);
        }
    }
}