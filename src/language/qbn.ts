/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parser';
import { TextLine, Range } from 'vscode';
import { Symbol, Task, Action, Parameter } from './common';
import { QuestBlock, QuestBlockKind, QuestParseContext } from "./questBlock";

/**
 * Quest resources and operation: the quest block that holds resources definition and tasks.
 */
export class Qbn extends QuestBlock {

    public readonly kind = QuestBlockKind.QBN;

    /**
     * Symbols that reference the resources used by the quest.
     */
    public readonly symbols = new Map<string, Symbol | Symbol[]>();

    /**
     * Headless startup task which starts automatically when the quest begins.
     */
    public readonly entryPoint: Action[] = [];

    /**
     * The executable components of the quest.
     */
    public readonly tasks = new Map<string, Task | Task[]>();

    /**
     * A special kind of tasks whose execution is based on the state of another task.
     */
    public readonly persistUntilTasks: Task[] = [];

    /**
    * Parses a line in a QBN block and build its diagnostic context.
    * @param line A line in QBN block. 
    */
    public parse(line: TextLine, context: QuestParseContext): void {

        // Symbol definition
        const symbol = Symbol.parse(line, context.data.language);
        if (symbol) {
            Qbn.pushMapItem(this.symbols, symbol.name, symbol);
            return;
        }

        // Task definition
        const task = Task.parse(line, context.data.tables);
        if (task) {
            if (task.definition.type === parser.tasks.TaskType.PersistUntil) {
                this.persistUntilTasks.push(task);
            } else {
                Qbn.pushMapItem(this.tasks, task.definition.symbol, task);
            }

            context.currentActionsBlock = task.actions;
            return;
        }

        // Action invocation
        const action = Action.parse(line, context.data.modules);
        if (action) {
            if (!context.currentActionsBlock) {
                context.currentActionsBlock = this.entryPoint;
            }
            context.currentActionsBlock.push(action);
            return;
        }

        this.failedParse.push(line);
    }

    /**
     * Iterates all symbols in this QBN block.
     */
    public *iterateSymbols(): Iterable<Symbol> {
        yield* Qbn.iterateMapItems(this.symbols);
    }

    /**
     * Iterates all tasks in this QBN block, including the *persist until* tasks.
     */
    public *iterateTasks(): Iterable<Task> {
        yield* Qbn.iterateMapItems(this.tasks);
        yield* this.persistUntilTasks;
    }

    /**
     * Iterates all actions from all tasks in this QBN block, 
     * including *persist until* tasks and the entry point.
     */
    public *iterateActions(): Iterable<Action> {
        yield* this.entryPoint;
        for (const task of this.iterateTasks()) {
            yield* task.actions;
        }
    }

    /**
     * Gets a symbol from any of its variations.
     * @param name Any variation of a symbol.
     */
    public getSymbol(name: string): Symbol | undefined {
        return Qbn.getMapItem(this.symbols, parser.symbols.getBaseSymbol(name));
    }

    /**
     * Gets a symbol from its range.
     * @param range The range of a symbol.
     */
    public getSymbolFrom(range: Range): Symbol | undefined {
        return Qbn.getResourceFrom(this.iterateSymbols(), range);
    }

    /**
     * Gets a task.
     * @param name The name of a task or its range.
     */
    public getTask(name: string): Task | undefined {
        return Qbn.getMapItem(this.tasks, name);
    }

    /**
     * Gets a task from its range.
     * @param range The range of a task.
     */
    public getTaskFrom(range: Range): Task | undefined {
        return Qbn.getResourceFrom(this.iterateTasks(), range);
    }

    /**
     * Gets a parameter of a symbol definition or an action.
     * @param range The range of the parameter in the document.
     */
    public getParameterFrom(range: Range): Parameter | undefined {
        return Qbn.getResourceContaining(this.iterateSymbols(), range)?.getParameterFrom(range)
            ?? Qbn.getResourceContaining(this.iterateActions(), range)?.getParameterFrom(range);
    }

    private static pushMapItem<T>(items: Map<string, T | T[]>, key: string, item: T) {
        const entry = items.get(key);
        if (!entry) {
            items.set(key, item);
        } else if (!Array.isArray(entry)) {
            items.set(key, [entry, item]);
        } else {
            entry.push(item);
        }
    }

    private static *iterateMapItems<T>(items: Map<string, T | T[]>): Iterable<T> {
        for (const item of items) {
            if (Array.isArray(item[1])) {
                yield* item[1];
            } else {
                yield item[1];
            }
        }
    }

    private static getMapItem<T>(items: Map<string, T | T[]>, key: string): T | undefined {
        const item = items.get(key);
        if (item) {
            return Array.isArray(item) ? item[0] : item;
        }
    }
}