/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parsers/parser';

import { Diagnostic, TextLine, TextDocument, Location } from "vscode";
import { Errors, Warnings, Hints, wordRange, DiagnosticContext, TaskDefinitionContext, SymbolDefinitionContext } from './common';
import { Language } from '../language/language';
import { TEMPLATE_LANGUAGE } from '../extension';
import { doSignatureChecks, doWordsCheck } from './signatureCheck';
import { Modules } from '../language/modules';
import { TaskType } from '../parsers/parser';

/**
 * Do diagnostics for a line in a QBN block.
 *  * @param document A quest document.
 * @param line A line in QBN block.
 * @param context Context data for current diagnostics operation. 
 */
export function* qbnCheck(document: TextDocument, line: TextLine, context: DiagnosticContext): Iterable<Diagnostic> {

    // Symbol definition
    const symbol = parser.getSymbolFromLine(line);
    if (symbol) {
        const text = line.text.trim();
        const type = text.substring(0, text.indexOf(' '));
        const definition = Language.getInstance().findDefinition(type, text);

        // Add symbol definition
        const symbolDefinitionContext = {
            definition: {
                location: new Location(document.uri, wordRange(line, symbol)),
                type: type
            },
            isValid: !definition,
            words: definition ? definition.matches : null
        };
        const symbolDefinition = context.qbn.symbols.get(symbol);
        if (!symbolDefinition) {
            context.qbn.symbols.set(symbol, symbolDefinitionContext);
        } else if (!Array.isArray(symbolDefinition)) {
            if (symbolDefinition.definition.location.range.start.line !== line.lineNumber) {
                context.qbn.symbols.set(symbol, [symbolDefinition, symbolDefinitionContext]);
            } else {
                context.qbn.symbols.set(symbol, symbolDefinitionContext);
            }
        } else {
            if (!symbolDefinition.find(x => x.definition.location.range.start.line === line.lineNumber)) {
                symbolDefinition.push(symbolDefinitionContext);
            }
        }

        return;
    }

    // Task definition
    const task = parser.parseTaskDefinition(line.text);
    if (task) {

        if (task.type === TaskType.PersistUntil) {

            // until performed is associated to undefined task
            if (!context.qbn.tasks.has(task.symbol)) {
                yield Errors.undefinedUntilPerformed(wordRange(line, task.symbol), task.symbol);
            }

            return;
        }

        // Add task definition
        const newTaskDefinition = {
            range: wordRange(line, task.symbol),
            definition: task
        };
        const taskDefinition = context.qbn.tasks.get(task.symbol);
        if (!taskDefinition) {
            context.qbn.tasks.set(task.symbol, newTaskDefinition);
        } else if (!Array.isArray(taskDefinition)) {
            context.qbn.tasks.set(task.symbol, [taskDefinition, newTaskDefinition]);
        } else {
            taskDefinition.push(newTaskDefinition);
        }

        return;
    }

    // Action invocation
    const actionResult = Modules.getInstance().findAction(line.text);
    if (actionResult) {

        // Check action signature
        context.qbn.actions.set(line.text.trim(), {
            line: line,
            signature: actionResult.action.overloads[actionResult.overload]
        });
    }
    else {

        // Undefined action
        yield Errors.undefinedExpression(parser.trimRange(line), 'QBN');
    }
}

export function* analyseQbn(document: TextDocument, context: DiagnosticContext): Iterable<Diagnostic> {

    for (const symbolCtx of context.qbn.symbols) {

        if (!symbolCtx[1]) {
            continue;
        }

        const symbol = symbolCtx[1];
        const symbolName = symbolCtx[0];
        const symbolContext = Array.isArray(symbol) ? symbol[0] : symbol;
        if (!symbolContext) {
            continue;
        }

        function* checkSignature(symbol: SymbolDefinitionContext): Iterable<Diagnostic>  {
            if (symbol.words) {
                for (const diagnostic of doWordsCheck(context, document, symbol.words, document.lineAt(symbol.definition.location.range.start.line))) {
                    diagnostic.source = TEMPLATE_LANGUAGE;
                    yield diagnostic;
                }
            }
        }

        // Invalid signature or parameters
        if (symbolContext.isValid) {
            const lineRange = parser.trimRange(document.lineAt(symbolContext.definition.location.range.start.line));
            yield Errors.invalidDefinition(lineRange, symbolName, symbolContext.definition.type);
        }

        // Duplicated definition
        if (Array.isArray(symbol)) {
            const allLocations = symbol.map(x => x.definition.location);
            for (const symbolDefinition of symbol) {
                yield Errors.duplicatedDefinition(symbolDefinition.definition.location.range, symbolName, allLocations);
            }

            for (const signature of symbol) {
                yield* checkSignature(signature);
            }
        } else {
            yield* checkSignature(symbol);
        }

        // Unused
        if (!context.qbn.referencedSymbols.has(symbolName) &&
            parser.findSymbolReferences(document, symbolName, false)[Symbol.iterator]().next().value === undefined) { // non standard inside message blocks
            yield Warnings.unusedDeclarationSymbol(symbolContext.definition.location.range, symbolName);
        }

        // Clock
        if (symbolContext.definition.type === parser.Types.Clock) {
            if (!context.qbn.actions.has('start timer ' + symbolName)) {
                yield Warnings.unstartedClock(symbolContext.definition.location.range, symbolName);
            }
            if (!context.qbn.tasks.get(symbolName)) {
                yield Warnings.unlinkedClock(symbolContext.definition.location.range, symbolName);
            }
        }

        // Naming convention violation
        if (!parser.symbolFollowsNamingConventions(symbolName)) {
            yield Hints.symbolNamingConventionViolation(symbolContext.definition.location.range);
        }
    }

    for (const task of context.qbn.tasks) {
        
        const taskName = task[0];
        const taskContext = Array.isArray(task[1]) ? task[1][0] : task[1];
        if (!taskContext) {
            continue;
        }

        // Duplicated definition
        if (Array.isArray(task[1])) {
            const allLocations = task[1].map(x => new Location(document.uri, x.range));
            for (const definition of task[1] as TaskDefinitionContext[]) {
                yield Errors.duplicatedDefinition(definition.range, taskName, allLocations);
            }
        }

        const definition = taskContext.definition;
        if (definition) {
            
            // Unused
            if (!parser.isConditionalTask(document, taskContext.range.start.line) && !hasAnotherOccurrence(document, taskContext.range.start.line, definition.symbol)) {
                const name = definition.type === TaskType.GlobalVarLink ? definition.symbol + ' from ' + definition.globalVarName : definition.symbol;
                yield Warnings.unusedDeclarationSymbol(taskContext.range, name);
            }
        }

        // Naming convention violation
        if (!parser.symbolFollowsNamingConventions(taskName)) {
            yield Hints.symbolNamingConventionViolation(taskContext.range);
        }
    }

    for (const action of context.qbn.actions) {
        for (const diagnostic of doSignatureChecks(context, document, action[1].signature, action[1].line)) {
            diagnostic.source = TEMPLATE_LANGUAGE;
            yield diagnostic;
        }
    }
}

function hasAnotherOccurrence(document: TextDocument, ignored: number, symbol: string): boolean {
    return parser.firstLine(document, l => l.lineNumber !== ignored && l.text.indexOf(symbol) !== -1) !== undefined;
}