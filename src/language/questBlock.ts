/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parser';
import { Range, TextDocument, TextLine } from "vscode";
import { LanguageData } from "./static/languageData";
import { Action, QuestResource } from './common';

export enum QuestBlockKind {
    Preamble,
    QRC,
    QBN
}

export interface QuestParseContext {
    data: LanguageData;
    document: TextDocument;
    block: QuestBlock;
    blockStart: number;
    currentMessageBlock?: parser.messages.MessageBlock;
    currentActionsBlock?: Action[];
}

/**
 * A block of a quest.
 */
export abstract class QuestBlock {

    private _range: Range | undefined;

    /**
     * Which block is this?
     */
    public abstract get kind(): QuestBlockKind;

    /**
     * Lines which can't be parsed as any known quest object.
     */
    public readonly failedParse: TextLine[] = [];

    /**
     * True if this block has been found and parsed. Any line for which parse
     * operation was unsuccessful can be retrieved from `failedParse`.
     */
    public get found(): boolean {
        return this._range !== undefined;
    }

    /**
     * The range of the entire block.
     */
    public get range(): Range | undefined {
        return this._range;
    }

    /**
     * Parses a line of a document.
     * @param line The line to parse.
     * @param context Data for the current parse operation.
     */
    public abstract parse(line: TextLine, context: QuestParseContext): void;

    /**
     * Sets the range of this block in the parsed document.
     * @param document The document where this block is found.
     * @param start The first line number of this block.
     * @param end The last line number of this block.
     */
    public setRange(document: TextDocument, start: number, end: number) {
        if (this._range !== undefined) {
            throw new Error('Quest block range is already set!');
        }

        this._range = document.validateRange(new Range(start, 0, end, Infinity));
    }

    /**
     * Gets a resource from its range.
     * @param resources An iterable of resources.
     * @param range The range of the resource (not the blockRange).
     */
    protected static getResourceFrom<T extends QuestResource>(resources: Iterable<T>, range: Range): T | undefined {
        for (const resource of resources) {
            if (resource.range.isEqual(range)) {
                return resource;
            }
        }
    }

    /**
     * Gets a resource that contains the given range.
     * @param resources An iterable of resources.
     * @param range A range that is inside or equal to the block range of the resource.
     */
    protected static getResourceContaining<T extends QuestResource>(resources: Iterable<T>, range: Range): T | undefined {
        for (const resource of resources) {
            if (resource.blockRange.contains(range)) {
                return resource;
            }
        }
    }
}