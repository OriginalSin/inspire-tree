'use strict';

// Libs
import * as _ from 'lodash';
import { create as createElement, diff, h, patch } from 'virtual-dom';
import { DOMReference } from './lib/DOMReference';
import InspireTree from './tree';
import { TreeNodes } from './treenodes';
import { VCache } from './lib/VCache';
import { VArrayDirtyCompare } from './lib/VArrayDirtyCompare';
import { VDirtyCompare } from './lib/VDirtyCompare';
import { VStateCompare } from './lib/VStateCompare';

export default class InspireDOM {
    private _tree: InspireTree;
    $activeDropTarget: any;
    $dragElement: any;
    $dragNode: any;
    $target: any;
    batching: number = 0;
    contextMenuNode: any;
    dragHandleOffset: any;
    dropTargets: any = [];
    contextMenuChoices: any;
    isDragDropEnabled: boolean = false;
    isDynamic: boolean = false;
    isMouseHeld: boolean = false;
    ol: any;
    rootNode: any;

    constructor(tree: InspireTree) {
        this._tree = tree;

        // Cache because we use in loops
        this.isDynamic = _.isFunction(this._tree.config.data);
        this.contextMenuChoices = this._tree.config.contextMenu;
    }

    /**
     * Apply pending data changes to the DOM.
     *
     * Will skip rendering as long as any calls
     * to `batch` have yet to be resolved,
     *
     * @category DOM
     * @private
     * @return {void}
     */
    applyChanges() {
        // Never rerender when until batch complete
        if (this.batching > 0) {
            return;
        }

        this.renderNodes();
    }

    /**
     * Attaches to the DOM element for rendering.
     *
     * @category DOM
     * @private
     * @param {HTMLElement} target Element, selector, or jQuery-like object.
     * @return {void}
     */
    attach(target) {
        var dom = this;
        dom.$target = dom.getElement(target);

        if (!dom.$target) {
            throw new Error('No valid element to attach to.');
        }

        dom.$target.className += ' inspire-tree';
        dom.$target.setAttribute('tabindex', dom._tree.config.tabindex || 0);

        // Handle keyboard interaction
        dom.$target.addEventListener('keyup', dom.keyboardListener);

        if (dom.contextMenuChoices) {
            document.body.addEventListener('click', function() {
                dom.closeContextMenu();
            });
        }

        var dragTargetSelectors = dom._tree.config.dragTargets;
        if (!_.isEmpty(dragTargetSelectors)) {
            _.each(dragTargetSelectors, function(selector) {
                var dropTarget = dom.getElement(selector);

                if (dropTarget) {
                    dom.dropTargets.push(dropTarget);
                }
                else {
                    throw new Error('No valid element found for drop target ' + selector);
                }
            });
        }

        dom.isDragDropEnabled = dom.dropTargets.length > 0;

        if (dom.isDragDropEnabled) {
            document.addEventListener('mouseup', dom.mouseUpListener);
            document.addEventListener('mousemove', dom.mouseMoveListener);
        }

        // Sync browser focus to focus state
        dom._tree.on('node.focused', function(node) {
            var elem = node.itree.ref.node.querySelector('.title');
            if (elem !== document.activeElement) {
                elem.focus();
            }
        });

        dom.$target.inspireTree = dom._tree;
    }

    /**
     * Disable rendering in preparation for multiple changes.
     *
     * @category DOM
     * @private
     * @return {void}
     */
    batch() {
        if (this.batching < 0) {
            this.batching = 0;
        }

        this.batching++;
    }

    /**
     * Clear page text selection, primarily after a click event which
     * nativelt selects a range of text.
     *
     * @category DOM
     * @private
     * @return {void}
     */
    private clearSelection() {
        if (document.selection && document.selection.empty) {
            document.selection.empty();
        }
        else if (window.getSelection) {
            window.getSelection().removeAllRanges();
        }
    }

    /**
     * Closes any open context menu.
     *
     * @category DOM
     * @private
     * @return {void}
     */
    private closeContextMenu() {
        if (this.contextMenuNode) {
            this.contextMenuNode.parentNode.removeChild(this.contextMenuNode);
            this.contextMenuNode = null;
        }
    }

    /**
     * Creates a tri-state checkbox input.
     *
     * @param {TreeNode} node Node object.
     * @return {object} Input node element.
     */
    private createCheckbox(node) {
        var dom = this;

        return new VCache({
            selected: node.selected(),
            indeterminate: node.indeterminate()
        }, VStateCompare, function() {
            return h('input', {
                attributes: {
                    type: 'checkbox'
                },
                checked: node.selected(),
                indeterminate: node.indeterminate(),
                onclick: function(event) {
                    // Define our default handler
                    var handler = function() {
                        node.toggleSelect();
                    };

                    // Emit an event with our forwarded MouseEvent, node, and default handler
                    dom._tree.emit('node.click', event, node, handler);

                    // Unless default is prevented, auto call our default handler
                    if (!event.treeDefaultPrevented) {
                        handler();
                    }
                }
            }, []);
        });
    }

    /**
     * Creates a context menu unordered list.
     *
     * @private
     * @param {array} choices Array of choice objects.
     * @param {object} node Clicked node.
     * @return {object} Unordered list node.
     */
    private createContextMenu(choices, node) {
        var dom = this;

        return h('ul.itree-menu', {
            onclick: function(event) {
                event.stopPropagation();
            }
        }, _.transform(choices, function(contents, choice) {
            contents.push(dom.createContextMenuListItem(choice, node));
        }, []));
    }

    /**
     * Creates a context menu list item.
     *
     * @private
     * @param {object} choice Choice object.
     * @param {object} node Node object.
     * @return {object} List item node.
     */
    private createContextMenuListItem(choice, node) {
        var dom = this;

        return h('li', [[
            h('a', {
                onclick: function(event) {
                    choice.handler(event, node, dom.closeContextMenu);
                }
            }, choice.text)
        ]]);
    }

    /**
     * Creates a draggable element by cloning a target,
     * registers a listener for mousemove.
     *
     * @private
     * @param {HTMLElement} element DOM Element.
     * @param {Event} event Click event to use.
     * @return {void}
     */
    private createDraggableElement(element, event) {
        this.$dragNode = this.nodeFromTitleDOMElement(element);

        var offset = this.getAbsoluteOffset(element);
        var diffX = event.clientX - offset.left;
        var diffY = event.clientY - offset.top;

        this.dragHandleOffset = { left: diffX, top: diffY };

        this.$dragElement = element.cloneNode(true);
        this.$dragElement.className += ' dragging';
        this.$dragElement.style.top = offset.top + 'px';
        this.$dragElement.style.left = offset.left + 'px';
        this.$target.appendChild(this.$dragElement);
    }

    /**
     * Creates a list item node when a dynamic node returns no children.
     *
     * Cannot be clicked or expanded.
     *
     * @private
     * @return {object} List Item node.
     */
    private createEmptyListItemNode() {
        return new VCache({}, VStateCompare, function() {
            return h('ol', [
                h('li.leaf', [
                    h('span.title.icon.icon-file-empty.empty', ['No Results'])
                ])
            ]);
        });
    }

    /**
     * Creates a list item node for a specific data node.
     *
     * @private
     * @param {object} node Data node.
     * @return {object} List Item node.
     */
    private createListItemNode(node) {
        var dom = this;

        return new VCache({
            dirty: node.itree.dirty
        }, VDirtyCompare, function() {
            var attributes = node.itree.li.attributes || {};
            node.itree.dirty = false;
            node.itree.ref = new DOMReference();

            var contents = [
                dom.createTitleContainer(node),
                h('div.wholerow', [])
            ];

            if (node.hasChildren()) {
                contents.push(dom.createOrderedList(node.children));
            }
            else if (dom.isDynamic) {
                contents.push(dom.createEmptyListItemNode());
            }

            // Add classes for any enabled states
            // http://jsperf.com/object-keys-to-classnames
            var classNames = '.';
            var state = node.itree.state;
            _.each(Object.keys(state), function(key) {
                if (state[key]) {
                    classNames += '.' + key;
                }
            });

            // Inverse and additional classes
            if (!node.hidden() && node.removed()) {
                classNames += '.hidden';
            }

            if (node.expanded()) {
                classNames += '.expanded';
            }

            classNames += node.children ? '.folder' : '.leaf';

            // Append any custom class names
            var customClasses = attributes.class || attributes.className;
            if (_.isFunction(customClasses)) {
                customClasses = customClasses(node);
            }

            // Append content correctly
            if (customClasses) {
                if (_.isString(customClasses)) {
                    classNames += '.' + customClasses.replace(' ', '.');
                }
                else if (_.isArray(customClasses)) {
                    classNames += '.' + customClasses.join('.');
                }
            }

            // Force internal-use attributes
            attributes['data-uid'] = node.id;

            return h('li' + classNames, {
                attributes: attributes,
                ref: node.itree.ref
            }, contents);
        });
    }

    /**
     * Creates list item nodes for an array of data nodes.
     *
     * @private
     * @param {array} nodes Data nodes.
     * @return {array} Array of List Item nodes.
     */
    private createListItemNodes(nodes) {
        var dom = this;
        var domNodes = [];

        _.each(nodes, function(node) {
            // We can't just remove the node if soft-removed
            // https://github.com/Matt-Esch/virtual-dom/issues/333
            domNodes.push(dom.createListItemNode(node));
        });

        return domNodes;
    }

    /**
     * Creates an ordered list containing list item for
     * provided data nodes.
     *
     * @private
     * @param {array} nodes Data nodes.
     * @return {object} Oredered List node.
     */
    private createOrderedList(nodes: TreeNodes) {
        var dom = this;

        return new VCache({
            nodes: nodes,
            nodeCount: nodes.length
        }, VArrayDirtyCompare, function() {
            return h('ol', dom.createListItemNodes(nodes));
        });
    }

    /**
     * Creates an anchor around the node title.
     *
     * @private
     * @param {object} node Node object.
     * @param {boolean} hasVisibleChildren If this node has visible children.
     * @return {object} Anchor node.
     */
    private createTitleAnchor(node, hasVisibleChildren) {
        var dom = this;

        return new VCache({
            expanded: node.expanded(),
            icon: node.itree.icon,
            text: node.text,
            hasVisibleChildren: hasVisibleChildren
        }, VStateCompare, function(previous, current) {
            var attributes = node.itree.a.attributes || {};
            var classNames = ['title', 'icon'];

            if (!dom._tree.config.showCheckboxes) {
                var folder = node.expanded() ? 'icon-folder-open' : 'icon-folder';
                classNames.push(current.state.icon || (hasVisibleChildren ? folder : 'icon-file-empty'));
            }

            attributes.tabindex = 1;
            attributes.unselectable = 'on';

            return h('a.' + classNames.join('.'), {
                attributes: attributes,
                onblur: function() {
                    node.blur();
                },
                oncontextmenu: function(event) {
                    if (dom.contextMenuChoices) {
                        // Define our default handler
                        var handler = function() {
                            dom.renderContextMenu(event, node);
                        };

                        // Emit an event with our forwarded MouseEvent, node, and default handler
                        dom._tree.emit('node.contextmenu', event, node, handler);

                        // Unless default is prevented, auto call our default handler
                        if (!event.treeDefaultPrevented) {
                            handler();
                        }
                    }
                },
                onclick: function(event) {
                    // Define our default handler
                    var handler = function() {
                        event.preventDefault();

                        if (event.metaKey || event.ctrlKey || event.shiftKey) {
                            dom._tree.disableDeselection();
                        }

                        if (event.shiftKey) {
                            dom.clearSelection();

                            var selected = dom._tree.lastSelectedNode();
                            if (selected) {
                                dom._tree.selectBetween.apply(dom._tree, dom._tree.boundingNodes(selected, node));
                            }
                        }

                        if (node.selected()) {
                            if (!dom._tree.config.selection.disableDirectDeselection) {
                                node.deselect();
                            }
                        }
                        else {
                            node.select();
                        }

                        dom._tree.enableDeselection();
                    };

                    // Emit an event with our forwarded MouseEvent, node, and default handler
                    dom._tree.emit('node.click', event, node, handler);

                    // Unless default is prevented, auto call our default handler
                    if (!event.treeDefaultPrevented) {
                        handler();
                    }
                },
                ondblclick: function(event) {
                    // Define our default handler
                    var handler = function() {
                        // Clear text selection which occurs on double click
                        dom.clearSelection();

                        node.toggleCollapse();
                    };

                    // Emit an event with our forwarded MouseEvent, node, and default handler
                    dom._tree.emit('node.dblclick', event, node, handler);

                    // Unless default is prevented, auto call our default handler
                    if (!event.treeDefaultPrevented) {
                        handler();
                    }
                },
                onfocus: function() {
                    node.focus();
                },
                onmousedown: function() {
                    if (dom.isDragDropEnabled) {
                        dom.isMouseHeld = true;
                    }
                }
            }, [current.state.text]);
        });
    }

    /**
     * Creates a container element for the title/toggle/icons.
     *
     * @private
     * @param {string} node Node object.
     * @return {object} Container node.
     */
    private createTitleContainer(node) {
        var dom = this;
        var hasVisibleChildren = !dom.isDynamic ? node.hasVisibleChildren() : Boolean(node.children);

        return new VCache({
            hasVisibleChildren: hasVisibleChildren,
            collapsed: node.collapsed(),
            selected: node.selected(),
            indeterminate: node.indeterminate()
        }, VStateCompare, function() {
            var contents = [];

            if (hasVisibleChildren) {
                contents.push(dom.createToggleAnchor(node));
            }

            if (dom._tree.config.showCheckboxes) {
                contents.push(dom.createCheckbox(node));
            }

            contents.push(dom.createTitleAnchor(node, hasVisibleChildren));

            return h('div.title-wrap', contents);
        });
    }

    /**
     * Creates an anchor used for expanding and collapsing a node.
     *
     * @private
     * @param {object} node Node object.
     * @return {object} Anchor node.
     */
    private createToggleAnchor(node) {
        return new VCache({
            collapsed: node.collapsed()
        }, VStateCompare, function(previous, current) {
            var icon = (current.state.collapsed ? '.icon-expand' : '.icon-collapse');

            return h('a.toggle.icon' + icon, {
                onclick: function() {
                    node.toggleCollapse();
                }
            }, []);
        });
    }

    /**
     * Permit rerendering of batched changes.
     *
     * @category DOM
     * @private
     * @return {void}
     */
    end() {
        this.batching--;

        if (this.batching === 0) {
            this.applyChanges();
        }
    }

    /**
     * Calculcates the absolute offset values of an element.
     *
     * @private
     * @param {HTMLElement} element HTML Element.
     * @return {object} Object with top/left values.
     */
    private getAbsoluteOffset(element) {
        var x = 0;
        var y = 0;

        while (element && !isNaN(element.offsetLeft) && !isNaN(element.offsetTop)) {
            x += element.offsetLeft - element.scrollLeft;
            y += element.offsetTop - element.scrollTop;
            element = element.offsetParent;
        }

        // IE10 stores scroll values on documentElement instead.
        // Due to unit testing, document may not always exist
        if (typeof document !== 'undefined') {
            x -= document.documentElement.scrollLeft;
            y -= document.documentElement.scrollTop;
        }

        return { top: y, left: x };
    }

    /**
     * Get an HTMLElement through various means:
     * An element, jquery object, or a selector.
     *
     * @private
     * @param {mixed} target Element, jQuery selector, selector.
     * @return {HTMLElement} Matching element.
     */
    private getElement(target) {
        var $element;

        if (target instanceof HTMLElement) {
            $element = target;
        }
        else if (_.isObject(target) && _.isObject(target[0])) {
            $element = target[0];
        }
        else if (_.isString(target)) {
            var match = document.querySelector(target);
            if (match) {
                $element = match;
            }
        }

        return $element;
    }

    /**
     * Helper method to find a scrollable ancestor element.
     *
     * @param  {HTMLElement} $element Starting element.
     * @return {HTMLElement} Scrollable element.
     */
    private getScrollableAncestor($element) {
        if ($element instanceof Element) {
            var style = getComputedStyle($element);
            if (style.overflow !== 'auto' && $element.parentNode) {
                $element = this.getScrollableAncestor($element.parentNode);
            }
        }

        return $element;
    }

    /**
     * Listen to keyboard event for navigation.
     *
     * @private
     * @param {Event} event Keyboard event.
     * @return {void}
     */
    private keyboardListener(event) {
        // Navigation
        var focusedNode = this._tree.focused();
        if (focusedNode) {
            focusedNode = focusedNode[0];
            switch (event.which) {
                case 40:
                    this.moveFocusDownFrom(focusedNode);
                    break;
                case 13:
                    focusedNode.toggleSelect();
                    break;
                case 37:
                    focusedNode.collapse();
                    break;
                case 39:
                    focusedNode.expand();
                    break;
                case 38:
                    this.moveFocusUpFrom(focusedNode);
                    break;
                default:
            }
        }
    }

    /**
     * Listener for mouse move events for drag and drop.
     * Is removed automatically on mouse up.
     *
     * @private
     * @param {Event} event Mouse move event.
     * @return {void}
     */
    private mouseMoveListener(event) {
        if (this.isMouseHeld && !this.$dragElement) {
            this.createDraggableElement(event.target, event);
        }
        else if (this.$dragElement) {
            event.preventDefault();
            event.stopPropagation();

            var x = event.clientX - this.dragHandleOffset.left;
            var y = event.clientY - this.dragHandleOffset.top;

            this.$dragElement.style.left = x + 'px';
            this.$dragElement.style.top = y + 'px';

            var validTarget;
            _.each(this.dropTargets, function(target) {
                var rect = target.getBoundingClientRect();

                if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    validTarget = target;
                    return false;
                }
            });

            // If new target found for the first time
            if (!this.$activeDropTarget && validTarget && validTarget.className.indexOf('itree-active-drop-target') === -1) {
                validTarget.className += ' itree-active-drop-target';
            }

            this.$activeDropTarget = validTarget;
        }
    }

    /**
     * Handle mouse up events for dragged elements.
     *
     * @return {void}
     */
    private mouseUpListener() {
        this.isMouseHeld = false;

        if (this.$dragElement) {
            this.$dragElement.parentNode.removeChild(this.$dragElement);

            if (this.$activeDropTarget) {
                var targetIsTree = _.isFunction(_.get(this.$activeDropTarget, 'inspireTree.addNode'));

                // Notify that the node was "dropped out" of this tree
                this._tree.emit('node.dropout', this.$dragNode, this.$activeDropTarget, targetIsTree);

                // If drop target supports the addNode method, invoke it
                if (targetIsTree) {
                    var newNode = this.$activeDropTarget.inspireTree.addNode(this.$dragNode.copyHierarchy().export());

                    // Notify that the node was "dropped out"
                    this.$activeDropTarget.inspireTree.emit('node.dropin', newNode);
                }
            }
        }

        if (this.$activeDropTarget) {
            this.$activeDropTarget.className = this.$activeDropTarget.className.replace('itree-active-drop-target', '');
        }

        this.$dragNode = null;
        this.$dragElement = null;
        this.$activeDropTarget = null;
    }

    /**
     * Move select down the visible tree from a starting node.
     *
     * @private
     * @param {object} startingNode Node object.
     * @return {void}
     */
    private moveFocusDownFrom(startingNode) {
        var next = startingNode.nextVisibleNode();
        if (next) {
            next.focus();
        }
    }

   /**
    * Move select up the visible tree from a starting node.
    *
    * @private
    * @param {object} startingNode Node object.
    * @return {void}
    */
    private moveFocusUpFrom(startingNode) {
        var prev = startingNode.previousVisibleNode();
        if (prev) {
            prev.focus();
        }
    }

    /**
     * Helper method for obtaining the data-uid from a DOM element.
     *
     * @private
     * @param {HTMLElement} element HTML Element.
     * @return {object} Node object
     */
    private nodeFromTitleDOMElement(element) {
        var uid = element.parentNode.parentNode.getAttribute('data-uid');
        return this._tree.node(uid);
    }

    /**
     * Renders a context menu for a given contextmenu click and node.
     *
     * @private
     * @param {object} event Click event.
     * @param {object} node Clicked node object.
     * @return {void}
     */
    private renderContextMenu(event, node) {
        var choices = this.contextMenuChoices;

        if (_.isArrayLike(choices)) {
            event.preventDefault();

            if (!this.contextMenuNode) {
                var ul = this.createContextMenu(choices, node);
                this.contextMenuNode = createElement(ul);
                document.body.appendChild(this.contextMenuNode);
            }

            this.contextMenuNode.style.top = event.clientY + 'px';
            this.contextMenuNode.style.left = event.clientX + 'px';
        }
    }

    /**
     * Triggers rendering for the given node array.
     *
     * @category DOM
     * @private
     * @param {array} nodes Array of node objects.
     * @return {void}
     */
    private renderNodes(nodes?: TreeNodes) {
        var newOl = this.createOrderedList(nodes || this._tree.nodes());

        if (!this.rootNode) {
            this.rootNode = createElement(newOl);
            this.$target.appendChild(this.rootNode);
        }
        else {
            var patches = diff(this.ol, newOl);
            this.rootNode = patch(this.rootNode, patches);
        }

        this.ol = newOl;
    };

    /**
     * Scroll the first selected node into view.
     *
     * @category DOM
     * @private
     * @return {void}
     */
    scrollSelectedIntoView() {
        var $tree = document.querySelector('.inspire-tree');
        var $selected = $tree.querySelector('.selected');

        if ($selected) {
            var $container = this.getScrollableAncestor($tree);

            if ($container) {
                $container.scrollTop = $selected.offsetTop;
            }
        }
    }
}
