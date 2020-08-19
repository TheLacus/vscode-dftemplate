/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parser';
import { TextLine, Range } from "vscode";
import { tasks, wordRange } from "../parser";
import { QuestResourceCategory, SymbolType, ActionInfo } from "./static/common";
import { Modules } from "./static/modules";
import { Language } from "./static/language";
import { EOL } from 'os';
import { StaticData } from './static/staticData';
import { Tables } from './static/tables';

/**
 * A quest resource with a tag that defines its category.
 */
export type CategorizedQuestResource = {
    readonly kind: 'message'; readonly value: Message;
} | {
    readonly kind: 'symbol'; readonly value: Symbol; readonly variation?: string;
} | {
    readonly kind: 'task'; readonly value: Task;
} | {
    readonly kind: 'action'; readonly value: Action;
} | {
    readonly kind: 'quest' | 'directive' | 'type' | 'macro' | 'globalVar';
    readonly value: string;
};

/**
 * A resource usable in a quest.
 */
export interface QuestResource {

    /**
     * The range of the symbol declaration.
     */
    range: Range;

    /**
     * The range of the entire definition.
     */
    blockRange: Range;

    /**
     * Finalises the documentation for this resources.
     */
    makeDocumentation?: (language: Language, summary?: string) => string | undefined;
}

/**
 * A parameter in a single-line resource signature.
 */
export interface Parameter {
    
    /**
     * One of the `ParameterTypes`, such as `${_symbol_}`,
     * or a fixed part of the invocation (like `clear` in `clear _task_`).
     */
    readonly type: string;

    /**
     * The value of this parameter.
     */
    readonly value: string;

    /**
     * The index of the first character inside the parsed line.
     */
    readonly charIndex: number;
}

/**
 * A single-line resource with a list of parameters.
 */
export abstract class SingleLineQuestResource implements QuestResource {

    /**
     * The range of the symbol inside the line.
     */
    public readonly abstract range: Range;
    
    /**
     * The range of the line where the resource is defined, without leading or trailing spaces.
     */
    public readonly blockRange: Range;

    /**
     * Parameters used for the invocation of this resource.
     * Undefined if the parameters aren't recognised.
     */
    public readonly abstract signature: ReadonlyArray<Parameter> | undefined;

    protected constructor(line: TextLine) {
        this.blockRange = parser.trimRange(line);
    }

    /**
     * Gets the range for a single parameter inside the range of this resource.
     * @param parameter One of the parameters of this resource.
     */
    public getRange(parameter: Parameter): Range {
        return this.blockRange.with(
            this.blockRange.start.with(undefined, parameter.charIndex),
            this.blockRange.end.with(undefined, parameter.charIndex + parameter.value.length)
        );
    }

    /**
     * Gets a parameter from its range.
     * @param range The range of a parameter.
     */
    public getParameterFrom(range: Range): Parameter | undefined {
        if (this.signature !== undefined) {
            for (const parameter of this.signature) {
                if (this.getRange(parameter).isEqual(range)) {
                    return parameter;
                }
            }
        }
    }
}

/**
 * A directive inside the quest preamble.
 */
export class Directive extends SingleLineQuestResource {

    /**
     * The range of the directive value.
     * This is a convenience over `getRange()` with the only parameter.
     */
    public get valueRange(): Range {
        return this.getRange(this.parameter);
    }

    /**
     * The single parameter of the directive, for example `name` in `Quest: name`.
     */
    public readonly signature: ReadonlyArray<Parameter>;

    private constructor(

        /**
         * The name of this directive, for example `Quest` in `Quest: name`.
         */
        public readonly name: string,

        /**
         * The single parameter of the directive, for example `name` in `Quest: name`.
         * This is the same as `signature[0]`.
         */
        public readonly parameter: Parameter,

        /**
         * The range of the directive name.
         */
        public readonly range: Range,

        /**
         * The line where the directive is defined.
         */
        line: TextLine
    ) {
        super(line);
        this.signature = [parameter];
    }

    /**
     * Attempts to parse a directive inside the preamble.
     * @param line A text line with a directive.
     * @returns A `Directive` instance if parse operation was successful, `undefined` otherwise.
     */
    public static parse(line: TextLine, language: Language): Directive | undefined {
        const split = line.text.trim().split(':', 2);
        if (split.length === 2) {
            const result = language.findDirective(split[0]);
            if (result) {
                const match = result.signature.match(/[a-zA-Z]+: \${1:([a-zA-Z]+)}/);
                if (match) {
                    const parameter = {
                        type: `\${${match[1]}}`,
                        value: split[1].trim(),
                        charIndex: line.text.indexOf(split[1])
                    };
                    return new Directive(split[0].trim(), parameter, wordRange(line, split[0]), line);
                }
            }
        }
    }
}

/**
 * A symbol used by resources and tasks, and for text replacement inside messages.
 */
export class Symbol extends SingleLineQuestResource {

    private constructor(

        /**
         * What kind of resource is linked to this symbol.
         */
        public readonly type: SymbolType,

        /**
         * The string that allows to reference this symbol, declared with the definition.
         * It often includes a prefix and suffix: `_symbol_`.
         */
        public readonly name: string,

        /**
         * The range of the symbol.
         */
        public readonly range: Range,

        /**
         * The line where the symbol is defined.
         */
        public readonly line: TextLine,

        /**
         * Parameters provided with the symbol definition.
         */
        public readonly signature: ReadonlyArray<Parameter> | undefined) {
        
        super(line);
    }

    /**
     * Attempts to parse a symbol definition.
     * @param line A text line with a symbol definition.
     * @returns A `Symbol` instance if parse operation was successful, `undefined` otherwise.
     */
    public static parse(line: TextLine, language: Language): Symbol | undefined {
        const results = parser.symbols.parseSymbol(line.text);
        if (results !== undefined) {
            const signature = Symbol.parseSignature(results.type, line.text, language);
            return new Symbol(results.type as SymbolType, results.name, wordRange(line, results.name), line, signature);
        }
    }

    /**
     * Matches parameters for the given symbol definition.
     * @param type The type of the symbol.
     * @param line The symbol definition line.
     * @returns An array of parameters, which can be empty, if parse operation was successful,
     * `undefined` otherwise.
     */
    private static parseSignature(type: string, text: string, language: Language): ReadonlyArray<Parameter> | undefined {
        const definition = language.findDefinition(type, text);
        if (definition === undefined) {
            return undefined;
        }

        if (definition.matches !== undefined) {
            return definition.matches.reduce<Parameter[]>((parameters, word) => {
                const match = text.match(word.regex);
                if (match !== null && match.index !== undefined) {
                    parameters.push({
                        type: word.signature,
                        value: match[1],
                        charIndex: text.indexOf(match[1], match.index)
                    });
                }

                return parameters;
            }, []);
        }

        return [];
    }
}

/**
 * A group of actions that can be executed, with a flag for its triggered state.
 * When the action list is empty, the task is used as a set/unset variable.
 */
export class Task implements QuestResource {

    /**
     * The actions block owned by this task.
     */
    public readonly actions: Action[] = [];

    /**
     * True if this task is declared as a variable.
     */
    public get isVariable(): boolean {
        return this.definition.type === tasks.TaskType.Variable
            || this.definition.type === tasks.TaskType.GlobalVarLink;
    }

    /**
     * The range of the task with its actions block.
     */
    public get blockRange(): Range {
        return this.actions.length === 0 ? this.line.range :
            this.range.union(this.actions[this.actions.length - 1].line.range);
    }

    private constructor(

        /**
        * The string that allows to reference this task, declared with the definition.
        * It often includes a prefix and suffix: `_symbol_`.
        */
        public readonly name: string,

        /**
         * The line where this task is declared.
         */
        public readonly line: TextLine,

        /**
         * The range of the symbol of this task.
         */
        public readonly range: Range,

        /**
         * Informations provided with the task definition, such as symbol and type.
         */
        public readonly definition: tasks.TaskParseResult) {
    }

    /**
     * Does this task have at least one condition?
     */
    public hasAnyCondition(modules: Modules): boolean {
        return !!this.actions.find(action => {
            const actionInfo = modules.findAction(action.line.text);
            return !!(actionInfo && actionInfo.category === QuestResourceCategory.Condition);
        });
    }

    /**
     * Checks if at least one action is fully within the given range
     * and there are no actions which are only partially inside.
     * @example 
     * 'clicked item _item_'  // true
     * 'cked item _item_'     // false
     */
    public isValidSubRange(range: Range): boolean {
        const first = this.actions.find(x => x.line.lineNumber === range.start.line);
        const last = this.actions.find(x => x.line.lineNumber === range.end.line);

        return first !== undefined && range.start.character <= first.line.firstNonWhitespaceCharacterIndex &&
            last !== undefined && /^\s*$/.test(last.line.text.substring(range.end.character));
    }

    /**
     * Attempts to parse a task definition.
     * @param line A text line with a task definition.
     * @param tables Language tables used for parsing.
     * @returns A `Task` instance if parse operation was successful, `undefined` otherwise.
     */
    public static parse(line: TextLine, tables: Tables): Task | undefined {
        const task = parser.tasks.parseTask(line.text, tables.globalVarsTable.globalVars);
        if (task) {
            return new Task(task.symbol, line, wordRange(line, task.symbol), task);
        }
    }
}

/**
 * An action that belongs to a task and perform a specific function when task is active and conditions are met.
 */
export class Action extends SingleLineQuestResource {
    
    private _range: Range | undefined;

    /**
     * The line where this action is invoked.
     */
    public readonly line: TextLine;
    
    /**
     * All words inside this action. For example `start task _task_` is split into `[start, task, _task_]`.
     */
    public readonly signature: ReadonlyArray<Parameter>;
    
    /**
     * Informations on the source action from modules.
     */
    public readonly info: ActionInfo;

    /**
     * The range of the first word that is not a parameter.
     */
    public get range(): Range {
        return this._range ?? (this._range = this.getRange(Math.max(this.signature.findIndex(x => !x.type.startsWith('$')), 0)));
    }

    private constructor(line: TextLine, info: ActionInfo) {

        super(line);
        this.info = info;
        this.line = line;

        const words = Action.parseActionWords(line.text);
        const types = info.getSignature().replace(/\${\d:/g, '${').split(' ');

        if (types[types.length - 1].startsWith('${...')) {
            const paramsItem = types[types.length - 1].replace('${...', '${');
            types[types.length - 1] = paramsItem;
            while (types.length < words.length) {
                types.push(paramsItem);
            }
        }

        const signature: Parameter[] = [];
        for (let index = 0; index < words.length; index++) {
            const word = words[index];
            signature.push({
                value: word.value,
                charIndex: word.charIndex,
                type: types[index]
            });
        }

        this.signature = signature;
    }

    /**
     * Gets the range of this action or one of its parameters.
     * @param indexOrParameter The index of a parameter or parameter itself.
     */
    public getRange(indexOrParameter: number | Parameter): Range {
        if (typeof (indexOrParameter) === 'number') {
            indexOrParameter = this.signature[indexOrParameter];
        }

        return super.getRange(indexOrParameter);
    }

    /**
     * The first word that is not a parameter.
     */
    public getName(): string {
        const word = this.signature.find(x => !x.type.startsWith('$'));
        return word ? word.value : '';
    }

    /**
     * The entire signature as a readable string.
     */
    public getFullName(): string {
        return StaticData.prettySignature(this.info.getSignature());
    }

    /**
     * Is `other` an invocation of the same action as this one?
     * @param other Another action.
     */
    public compareSignature(other: Action) {
        if (this.signature[0].type === 'when' && other.signature[0].type === 'when') {
            return true;
        }

        return this.signature.length === other.signature.length &&
            !this.signature.find((parameter, index) => parameter.type !== other.signature[index].type);
    }

    /**
     * Compares the parameter types of this action with the given words.
     * @param args An array of words.
     */
    public isInvocationOf(...args: string[]) {
        return args.length <= this.signature.length &&
            args.find((arg, index) => arg !== this.signature[index].type) === undefined;
    }

    /**
     * Attempts to parse an action inside a task.
     * @param line A text line with an action.
     * @param modules Imported language data.
     * @returns An `Action` instance if parse operation was successful, `undefined` otherwise.
     */
    public static parse(line: TextLine, modules: Modules): Action | undefined {
        const info = modules.findAction(line.text);
        if (info) {
            return new Action(line, info);
        }
    }

    /**
     * Retrieves all words separated by spaces inside a text line.
     * @param text The full text of a line.
     */
    private static parseActionWords(text: string) {

        const words = [];

        let startIndex = 0;
        let insideWord = false;

        for (let currentIndex = 0; currentIndex <= text.length; currentIndex++) {
            const char = text[currentIndex];

            if (char === ' ' || currentIndex === text.length) {
                if (insideWord === true) {
                    insideWord = false;
                    words.push({
                        value: text.substring(startIndex, currentIndex),
                        charIndex: startIndex
                    });
                }

            } else {
                if (insideWord === false) {
                    insideWord = true;
                    startIndex = currentIndex;
                }
            }
        }

        return words;
    }
}

/**
 * A macro whose replacement text is based on context.
 */
export interface ContextMacro {

    /**
     * A short name prefixed by a `%` character.
     */
    symbol: string;

    /**
     * The range of the symbol inside a message block.
     */
    range: Range;
}

/**
 * A text block with a serial number. Can be used for popups, journal, letters, and rumours.
 */
export class Message implements QuestResource {

    /**
     * The block of text associated to this message.
     */
    public readonly textBlock: TextLine[] = [];

    /**
     * The range of the message including its text block.
     */
    public get blockRange(): Range {
        const lineRange = this.range.with(this.range.start.with(undefined, 0));
        return this.textBlock.length > 0 ?
            lineRange.union(this.textBlock[this.textBlock.length - 1].range) :
            lineRange;
    }

    private constructor(

        /**
         * The numeric id associated to this message.
         */
        public readonly id: number,

        /**
         * The range of the message id.
         */
        public readonly range: Range,

        /**
         * A meaningful string that can be used to reference the message.
         */
        public readonly alias?: string,
    
        /**
         * The range of the message alias.
         */
        public readonly aliasRange?: Range) {
    }

    /**
     * Adds the general description to the summary if this is a static message. 
     * @param summary The formatted comment block for this message.
     */
    public makeDocumentation(language: Language, summary?: string): string | undefined {

        if (this.alias) {
            const details = language.findMessage(this.alias);
            if (details) {
                summary = summary ? details.summary + EOL.repeat(2) + summary : details.summary;
            }
        }

        return summary;
    }

    /**
     * Makes a compact but readable preview of the message, to be shown inside tooltips.
     * @param textBlockSeparationLine Adds an empty line between definition and text block for better readability.
     * @param maxLenght Maximum number of characters taken from the text block.
     */
    public makePreview(textBlockSeparationLine: boolean, maxLenght: number = 150): string {
        const previewLines: string[] = [];

        previewLines.push(this.alias !== undefined ? `${this.alias}: [${this.id}]` : `Message: ${this.id}`);

        let lenght = 0;
        for (const line of this.textBlock) {
            let text = line.text.replace('<ce>', '').trim();
            
            if (text === '<--->') {
                break;
            }

            if (lenght === 0) {
                text = (textBlockSeparationLine ? '\n\n' : '\n') + text;
            }

            if ((lenght += text.length) >= maxLenght) {
                previewLines.push(text.substr(0, maxLenght - lenght - text.length) + ' [...]');
                break;
            }

            previewLines.push(text);
        }

        return previewLines.join(' ');
    }

    /**
     * Attempts to parse a message definition.
     * @param line A text line with a message definition.
     * @returns A `Message` instance if parse operation was successful, `undefined` otherwise.
     */
    public static parse(line: TextLine): Message | undefined {
        const result = parser.messages.parseMessage(line.text);
        if (result !== undefined) {
            return new Message(
                Number(result.id),
                wordRange(line, result.id),
                result.alias,
                result.alias !== undefined ? wordRange(line, result.alias) : undefined
            );
        }
    }
}