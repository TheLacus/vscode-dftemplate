/**
 *  Daggerfall Template for Visual Studio Code
 */

'use strict';

import * as parser from '../parser';
import { TextLine, Range, Position } from 'vscode';
import { Tables } from './static/tables';
import { Message, ContextMacro } from './common';
import { QuestBlock, QuestBlockKind, QuestParseContext } from "./questBlock";

/**
 * The quest block that holds text messages used by QBN resources.
 */
export class Qrc extends QuestBlock {

    public readonly kind = QuestBlockKind.QRC;

    /**
     * Messages definitions in this QRC block.
     */
    public readonly messages: Message[] = [];

    /**
     * Context macros used by messages.
     */
    public readonly macros: ContextMacro[] = [];

    /**
    * Parses a line in a QRC block and builds its diagnostic context.
    * @param document A quest document.
    * @param line A line in QRC block.
    */
    public parse(line: TextLine, context: QuestParseContext): void {

        // Inside a message block
        if (this.messages.length > 0 && context.currentMessageBlock && context.currentMessageBlock.isInside(line.lineNumber)) {
            this.parseMessageLine(line);
            return;
        }

        // Message definition 
        const message = Message.parse(line);
        if (message) {
            this.messages.push(message);
            context.currentMessageBlock = new parser.messages.MessageBlock(context.document, line.lineNumber);
            return;
        }   

        // Undefined expression in qrc block
        if (context.currentMessageBlock) {
            context.currentMessageBlock = undefined;
        }
        this.failedParse.push(line);
    }
    
    /**
     * Gets a message this QRC block.
     * @param name A numeric id or text alias.
     * @param tables Imported language tables.
     */
    public getMessage(name: string, tables: Tables): Message | undefined {
        let id: number | undefined = Number(name);
        if (isNaN(id)) {
            id = tables.staticMessagesTable.messages.get(name);
        }

        if (id) {
            return this.messages.find(x => x.id === id);
        }
    }

    /**
     * Gets a message from its range.
     * @param range The range of a message.
     */
    public getMessageFrom(range: Range): Message | undefined {
        return Qrc.getResourceFrom(this.messages, range);
    }

    /**
     * Iterates all text lines inside all message blocks.
     */
    public *iterateMessageLines(): Iterable<TextLine> {
        for (const message of this.messages) {
            yield* message.textBlock;
        }
    }
    
    /**
     * Finds an available message id which is bigger or equal than the given id
     * or the id of the message above the given position.
     * @param minOrPos The minimum id or the position where the message is going to be placed.
     */
    public getAvailableId(minOrPos: number | Position): number {

        function getPrecedingId(messages: Message[], position: Position): number {
            let precedingMessage: Message | undefined;
            for (const message of messages.filter(x => x.range.start.isBefore(position))) {
                if (!precedingMessage || message.range.start.isAfter(precedingMessage.range.start)) {
                    precedingMessage = message;
                }
            }

            return precedingMessage ? precedingMessage.id + 1 : 1011;
        }

        let id = minOrPos instanceof Position ? getPrecedingId(this.messages, minOrPos) : minOrPos;
        while (this.messages.find(x => x.id === id)) {
            id++;
        }
        return id;
    }

    private parseMessageLine(line: TextLine): void {

        // Text
        this.messages[this.messages.length - 1].textBlock.push(line);

        // Macros
        const regex = /%[a-z0-9]+\b/g;
        let result: RegExpExecArray | null;
        while (result = regex.exec(line.text)) {
            this.macros.push({
                symbol: result[0],
                range: new Range(line.lineNumber, result.index, line.lineNumber, result.index + result[0].length)
            });
        }
    }
}