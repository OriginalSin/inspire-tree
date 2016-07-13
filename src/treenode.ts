'use strict';

// Libs
import * as _ from 'lodash';
import InspireTree from './tree';
import { Promise } from 'es6-promise';
import { recurseDown } from './lib/recurse-down';
import { TreeNodes } from './treenodes';

interface ITree {
    dirty: boolean;
    parent: TreeNode;
    state: Object;
}

/**
 * Represents a singe node object within the tree.
 *
 * @category TreeNode
 * @param {TreeNode} source TreeNode to copy.
 * @return {TreeNode} Tree node object.
 */
export class TreeNode {
    private _tree: InspireTree;
    // children can only be boolean | TreeNode but must be "any" since
    // a union type won't satisfy our code use of it.
    children: any;
    id: string;
    itree: ITree;
    text: string;

    constructor(tree: InspireTree);
    constructor(tree: InspireTree, source: TreeNode)
    constructor(tree: InspireTree, source?: TreeNode) {
        this._tree = tree;

        var node = this;
        if (source instanceof TreeNode) {
            _.each(source, function(value, key) {
                // Skip private vars
                if (!_.startsWith('_')) {
                    if (_.isObject(value)) {
                        // Call clone directly for children
                        if (value instanceof TreeNodes) {
                            node[key] = value.clone();
                        }
                        // Deep clone other objects
                        else {
                            node[key] = _.cloneDeep(value);
                        }
                    }
                    // Copy primitives
                    else {
                        node[key] = value;
                    }
                }
            });
        }
    }

    /**
     * Add a child to this node.
     *
     * @category TreeNode
     * @param {object} child Node object.
     * @return {TreeNode} Node object.
     */
    addChild(child: Object) {
        if (_.isArray(this.children) || !_.isArrayLike(this.children)) {
            this.children = new TreeNodes(this._tree);
            this.children._context = this;
        }

        return this.children.addNode(child);
    }

    /**
     * Get if node available.
     *
     * @category TreeNode
     * @return {boolean} If available.
     */
    available() {
        return (!this.hidden() && !this.removed());
    }

    /**
     * Blur focus from this node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    blur() {
        return this._tree.baseStateChange('focused', false, 'blurred', this);
    };

    /**
     * Hides parents without any visible children.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    clean() {
        this.recurseUp(function(node) {
            if (node.hasParent()) {
                var parent = node.getParent();
                if (!parent.hasVisibleChildren()) {
                    parent.hide();
                }
            }
        });

        return this;
    }

    /**
     * Clones this node.
     *
     * @category TreeNode
     * @return {TreeNode} New node object.
     */
    clone() {
        return new TreeNode(this._tree, this);
    }

    /**
     * Collapse this node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    collapse() {
        return this._tree.baseStateChange('collapsed', true, 'collapsed', this);
    }

    /**
     * Get whether this node is collapsed.
     *
     * @return {boolean} Get if node collapsed.
     */
    collapsed() {
        return this.state('collapsed');
    }

    /**
     * Get the containing context. If no parent present, the root context is returned.
     *
     * @category TreeNode
     * @return {TreeNodes} Node array object.
     */
    context() {
        return this.hasParent() ? this.getParent().children : this._tree.model;
    }

    /**
     * Copies node to a new tree instance.
     *
     * @category TreeNode
     * @param {boolean} hierarchy Include necessary ancestors to match hierarchy.
     * @return {object} Property "to" for defining destination.
     */
    copy(hierarchy?: boolean) {
        var node = this;

        if (hierarchy) {
            node = node.copyHierarchy();
        }

        return {

            /**
             * Sets a destination.
             *
             * @category CopyNode
             * @param {object} dest Destination Inspire Tree.
             * @return {object} New node object.
             */
            to: function(dest) {
                if (!_.isFunction(dest.addNode)) {
                    throw new Error('Destination must be an Inspire Tree instance.');
                }

                return dest.addNode(node.export());
            }
        };
    }

    /**
     * Copies all parents of a node.
     *
     * @category TreeNode
     * @param {boolean} excludeNode Exclude given node from hierarchy.
     * @return {TreeNode} Root node object with hierarchy.
     */
    copyHierarchy(excludeNode?: boolean) {
        var node = this;
        var nodes = [];
        var parents = node.getParents();

        // Remove old hierarchy data
        _.each(parents, function(node) {
            var clone = _.cloneDeep(node);
            delete clone.itree.parent;
            delete clone.children;

            nodes.push(clone);
        });

        parents = new TreeNodes(node._tree, nodes.reverse());

        if (!excludeNode) {
            var clone = _.cloneDeep(node);

            // Filter out hidden children
            if (node.hasChildren()) {
                clone.children = node.children.filter(function(n) {
                    return !n.state('hidden');
                }).clone();

                clone.children._context = clone;
            }

            nodes.push(clone);
        }

        var hierarchy = nodes[0];
        var pointer = hierarchy;
        var l = nodes.length;
        _.each(nodes, function(parent, key) {
            var children = new TreeNodes(node._tree);

            if (key + 1 < l) {
                children.push(nodes[key + 1]);
                pointer.children = children;

                pointer = pointer.children[0];
            }
        });

        return hierarchy;
    };

    /**
     * Deselect this node.
     *
     * If selection.require is true and this is the last selected
     * node, the node will remain in a selected state.
     *
     * @category TreeNode
     * @param {boolean} skipParentIndeterminate Skip refreshing parent indeterminate states.
     * @return {TreeNode} Node object.
     */
    deselect(skipParentIndeterminate?: boolean) {
        if (this.selected() && (!this._tree.config.selection.require || this._tree.selected().length > 1)) {
            var node = this;
            this._tree.dom.batch();

            this.state('indeterminate', false);
            this._tree.baseStateChange('selected', false, 'deselected', this);

            // If children were auto-selected
            if (this._tree.config.selection.autoSelectChildren) {
                // Deselect all children
                if (node.hasChildren()) {
                    node.children.each(function(child) {
                        child.deselect(true);
                    });
                }

                if (node.hasParent()) {
                    // Set indeterminate state for parent
                    if (this._tree.config.showCheckboxes && !skipParentIndeterminate) {
                        node.getParent().refreshIndeterminateState();
                    }
                    else {
                        // Deselect parent node
                        this._tree.baseStateChange('selected', false, 'deselected', node.getParent());
                    }
                }
            }

            this._tree.dom.end();
        }

        return this;
    }

    /**
     * Expand this node.
     *
     * @category TreeNode
     * @return {Promise} Promise resolved on successful load and expand of children.
     */
    expand() {
        var node = this;

        return new Promise(function(resolve, reject) {
            var allow = (node.hasChildren() || (node._tree.isDynamic && node.children === true));

            if (allow && (node.collapsed() || node.hidden())) {
                node.state('collapsed', false);
                node.state('hidden', false);

                node._tree.emit('node.expanded', node);

                if (node._tree.isDynamic && node.children === true) {
                    node.loadChildren().then(resolve).catch(reject);
                }
                else {
                    node.markDirty();
                    node._tree.dom.applyChanges();
                    resolve(node);
                }
            }
            else {
                // Resolve immediately
                resolve(node);
            }
        });
    }

    /**
     * Get if node expanded.
     *
     * @category TreeNode
     * @return {boolean} If expanded.
     */
    expanded() {
        return !this.collapsed();
    }

    /**
     * Expand parent nodes.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    expandParents() {
        if (this.hasParent()) {
            this.getParent().recurseUp(function(node) {
                node.expand();
            });
        }

        return this;
    }

    /**
     * Clones a node, removes itree property, and returns it
     * as a native object.
     *
     * Note: does not use node.clone() because we don't want a
     * TreeNode and we need to avoid redundant cloning children.
     *
     * @category TreeNode
     * @return {object} Cloned/modified node object.
     */
    export() {
        var clone = _.cloneDeep(this);
        delete clone.itree;

        if (clone.hasChildren()) {
            clone.children = clone.children.export();
        }

        return clone.toObject();
    }

    /**
     * Focus a node without changing its selection.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    focus() {
        var node = this;

        if (!node.focused()) {
            // Batch selection changes
            this._tree.dom.batch();
            this._tree.blurDeep();
            node.state('focused', true);

            // Emit this event
            this._tree.emit('node.focused', node);

            // Mark hierarchy dirty and apply
            node.markDirty();
            this._tree.dom.end();
        }

        return node;
    }

    /**
     * Get whether this node is focused.
     *
     * @return {boolean} Get if node focused.
     */
    focused() {
        return this.state('focused');
    }

    /**
     * Get children for this node. If no children exist, an empty TreeNodes
     * collection is returned for safe chaining.
     *
     * @category TreeNode
     * @return {TreeNodes} Array of node objects.
     */
    getChildren() {
        return this.hasChildren() ? this.children : new TreeNodes(this._tree);
    }

    /**
     * Get the immediate parent, if any.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    getParent() {
        return this.itree.parent;
    }

    /**
     * Returns parent nodes. Excludes any siblings.
     *
     * @category TreeNode
     * @return {TreeNodes} Node objects.
     */
    getParents() {
        var parents = new TreeNodes(this._tree);

        if (this.hasParent()) {
            this.getParent().recurseUp(function(node) {
                parents.push(node);
            });
        }

        return parents;
    }

    /**
     * Get a textual hierarchy for a given node. An array
     * of text from this node's root ancestor to the given node.
     *
     * @category TreeNode
     * @return {array} Array of node texts.
     */
    getTextualHierarchy() {
        var paths = [];

        this.recurseUp(function(node) {
            paths.unshift(node.text);
        });

        return paths;
    }

    /**
     * If node has any children.
     *
     * @category TreeNode
     * @return {boolean} If children.
     */
    hasChildren() {
        return (_.isArrayLike(this.children) && this.children.length > 0);
    }

    /**
     * If node has a parent.
     *
     * @category TreeNode
     * @return {boolean} If parent.
     */
    hasParent() {
        return Boolean(this.itree.parent);
    }

    /**
     * If node has any visible children.
     *
     * @category TreeNode
     * @return {boolean} If visible children.
     */
    hasVisibleChildren() {
        var hasVisibleChildren = false;

        if (this.hasChildren()) {
            hasVisibleChildren = (this.children.filter('available').length > 0);
        }

        return hasVisibleChildren;
    }

    /**
     * Hide this node.
     *
     * @category TreeNode
     * @return {object} Node object.
     */
    hide() {
        var node = this._tree.baseStateChange('hidden', true, 'hidden', this);

        // Update children
        if (node.hasChildren()) {
            node.children.hide();
        }

        return node;
    }

    /**
     * Get whether this node is hidden.
     *
     * @return {boolean} Get if node hidden.
     */
    hidden() {
        return this.state('hidden');
    }

    /**
     * Returns a "path" of indices, values which map this node's location within all parent contexts.
     *
     * @category TreeNode
     * @return {string} Index path
     */
    indexPath() {
        var indices = [];

        this.recurseUp(function(node) {
            indices.push(_.indexOf(node.context(), node));
        });

        return indices.reverse().join('.');
    }

    /**
     * Get whether this node is indeterminate.
     *
     * @return {boolean} Get if node indeterminate.
     */
    indeterminate() {
        return this.state('indeterminate');
    }

    /**
     * Find the last + deepest visible child of the previous sibling.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    lastDeepestVisibleChild() {
        var found;

        if (this.hasChildren() && !this.collapsed()) {
            found = _.findLast(this.children, function(node: any) {
                return (<TreeNode> node).visible();
            });

            var res = found.lastDeepestVisibleChild();
            if (res) {
                found = res;
            }
        }

        return found;
    }

    /**
     * Initiate a dynamic load of children for a given node.
     *
     * This requires `tree.config.data` to be a function which accepts
     * three arguments: node, resolve, reject.
     *
     * Use the `node` to filter results.
     *
     * On load success, pass the result array to `resolve`.
     * On error, pass the Error to `reject`.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */

    loadChildren() {
        var node = this;

        return new Promise(function(resolve, reject) {
            if (!node._tree.isDynamic || node.children !== true) {
                reject(new Error('Node does not have or support dynamic children.'));
            }

            node.state('loading', true);
            node.markDirty();
            node._tree.dom.applyChanges();

            var complete = function(results) {
                node._tree.dom.batch();
                node.state('loading', false);
                node.children = node._tree.collectionToModel(results, node);
                node.markDirty();
                node._tree.dom.end();

                resolve(node.children);

                node._tree.emit('children.loaded', node);
            };

            var error = function(err) {
                node.state('loading', false);
                node.children = new TreeNodes(node._tree);
                node.children._context = node;
                node.markDirty();
                node._tree.dom.applyChanges();

                reject(err);

                node._tree.emit('tree.loaderror', err);
            };

            var loader = node._tree.config.data(node, complete, error);

            // Data loader is likely a promise
            if (_.isObject(loader)) {
                node._tree.standardizePromise(loader).then(complete).catch(error);
            }
        });
    }

    /**
     * Get whether this node is loading child data.
     *
     * @return {boolean} Get if node loading.
     */
    loading() {
        return this.state('loading');
    }

    /**
     * Mark a node as dirty, rebuilding this node in the virtual DOM
     * and rerendering to the live DOM, next time applyChanges is called.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    markDirty() {
        if (!this.itree.dirty) {
            this.itree.dirty = true;

            if (this.hasParent()) {
                this.getParent().markDirty();
            }
        }

        return this;
    }

    /**
     * Find the next visible sibling of our ancestor. Continues
     * seeking up the tree until a valid node is found or we
     * reach the root node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    nextVisibleAncestralSiblingNode() {
        var next;

        if (this.hasParent()) {
            var parent = this.getParent();
            next = parent.nextVisibleSiblingNode();

            if (!next) {
                next = parent.nextVisibleAncestralSiblingNode();
            }
        }

        return next;
    }

    /**
     * Find next visible child node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object, if any.
     */
    nextVisibleChildNode() {
        var startingNode = this;
        var next;

        if (startingNode.hasChildren()) {
            next = _.find(startingNode.children, function(child) {
                return (<TreeNode> child).visible();
            });
        }

        return next;
    }

    /**
     * Get the next visible node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object if any.
     */
    nextVisibleNode() {
        var startingNode = this;
        var next;

        // 1. Any visible children
        next = startingNode.nextVisibleChildNode();

        // 2. Any Siblings
        if (!next) {
            next = startingNode.nextVisibleSiblingNode();
        }

        // 3. Find sibling of ancestor(s)
        if (!next) {
            next = startingNode.nextVisibleAncestralSiblingNode();
        }

        return next;
    }

    /**
     * Find the next visible sibling node.
     *
     * @category TreeNode
     * @return {object} Node object, if any.
     */
    nextVisibleSiblingNode() {
        var startingNode = this;
        var context = (startingNode.hasParent() ? startingNode.getParent().children : this._tree.nodes());
        var i = _.findIndex(context, { id: startingNode.id });

        return _.find(_.slice(context, i + 1), function(node) {
            return (<TreeNode> node).visible();
        });
    }

    /**
     * Find the previous visible node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object, if any.
     */
    previousVisibleNode() {
        var startingNode = this;
        var prev;

        // 1. Any Siblings
        prev = startingNode.previousVisibleSiblingNode();

        // 2. If that sibling has children though, go there
        if (prev && prev.hasChildren() && !prev.collapsed()) {
            prev = prev.lastDeepestVisibleChild();
        }

        // 3. Parent
        if (!prev && startingNode.hasParent()) {
            prev = startingNode.getParent();
        }

        return prev;
    }

    /**
     * Find the previous visible sibling node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object, if any.
     */
    previousVisibleSiblingNode() {
        var context = (this.hasParent() ? this.getParent().children : this._tree.nodes());
        var i = _.findIndex(context, { id: this.id });
        return _.findLast(_.slice(context, 0, i), function(node) {
            return (<TreeNode> node).visible();
        });
    }

    /**
     * Iterate down node and any children.
     *
     * @category TreeNode
     * @param {function} iteratee Iteratee function.
     * @return {TreeNode} Resulting node.
     */
    recurseDown(iteratee: any) {
        recurseDown(this, iteratee);

        return this;
    }

    /**
     * Iterate up a node and its parents.
     *
     * @category TreeNode
     * @param {function} iteratee Iteratee function.
     * @return {TreeNode} Resulting node.
     */
    recurseUp(iteratee: any) {
        var result = iteratee(this);

        if (result !== false && this.hasParent()) {
            this.getParent().recurseUp(iteratee);
        }

        return this;
    }

    /**
     * Updates the indeterminate state of this node.
     *
     * Only available when checkbox=true.
     * True if some, but not all children are selected.
     * False if no children are selected.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    refreshIndeterminateState() {
        var node = this;
        var oldValue = node.state('indeterminate');
        node.state('indeterminate', false);

        if (this._tree.config.showCheckboxes) {
            if (node.hasChildren()) {
                var childrenCount = node.children.length;
                var indeterminate = 0;
                var selected = 0;

                node.children.each(function(n) {
                    if (n.selected()) {
                        selected++;
                    }

                    if (n.indeterminate()) {
                        indeterminate++;
                    }
                });

                // Set selected if all children are
                node.state('selected', (selected === childrenCount));

                // Set indeterminate if any children are, or some children are selected
                if (!node.selected()) {
                    node.state('indeterminate', indeterminate > 0 || (childrenCount > 0 && selected > 0 && selected < childrenCount));
                }
            }

            if (node.hasParent()) {
                node.getParent().refreshIndeterminateState();
            }

            if (oldValue !== node.state('indeterminate')) {
                node.markDirty();
            }
        }

        return node;
    }

    /**
     * Remove a node from the tree.
     *
     * @category TreeNode
     * @return {object} Removed tree node object.
     */
    remove() {
        var node = this;

        var parent;
        if (node.hasParent()) {
            parent = node.getParent();
        }

        var context = (parent ? parent.children : this._tree.model);
        _.remove(context, { id: node.id });

        if (parent) {
            parent.refreshIndeterminateState();
        }

        var exported = node.export();
        this._tree.emit('node.removed', exported);

        this._tree.dom.applyChanges();

        return exported;
    }

    /**
     * Get whether this node is soft-removed.
     *
     * @return {boolean} Get if node removed.
     */
    removed() {
        return this.state('removed');
    }

    /**
     * Restore state if soft-removed.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    restore() {
        return this._tree.baseStateChange('removed', false, 'restored', this);
    }

    /**
     * Select this node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    select() {
        var node = this;

        if (!node.selected() && node.selectable()) {
            // Batch selection changes
            node._tree.dom.batch();

            if (node._tree.canAutoDeselect()) {
                var oldVal = node._tree.config.selection.require;
                node._tree.config.selection.require = false;
                node._tree.deselectDeep();
                node._tree.config.selection.require = oldVal;
            }

            node.state('selected', true);

            if (node._tree.config.selection.autoSelectChildren) {
                if (node.hasChildren()) {
                    node.children.recurseDown(function(child) {
                        node._tree.baseStateChange('selected', true, 'selected', child);
                    });
                }

                if (node._tree.config.showCheckboxes && node.hasParent()) {
                    node.getParent().refreshIndeterminateState();
                }
            }

            // Cache as the last selected node
            node._tree._lastSelectedNode = node;

            // Emit this event
            node._tree.emit('node.selected', node);

            // Mark hierarchy dirty and apply
            node.markDirty();
            node._tree.dom.end();
        }

        return node;
    }

    /**
     * Get if node selectable.
     *
     * @category TreeNode
     * @return {boolean} If node selectable.
     */
    selectable() {
        var allow = this._tree.config.selection.allow(this);
        return typeof allow === 'boolean' ? allow : this.state('selectable');
    }

    /**
     * Get whether this node is selected.
     *
     * @return {boolean} Get if node selected.
     */
    selected() {
        return this.state('selected');
    }

    /**
     * Set a root property on this node.
     *
     * @category TreeNode
     * @param {string|number} property Property name.
     * @param {*} value New value.
     * @return {TreeNode} Node object.
     */
    set(property: string, value: any) {
        this[property] = value;
        this.markDirty();

        return this;
    }

    /**
     * Show this node.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    show() {
        return this._tree.baseStateChange('hidden', false, 'shown', this);
    }

    /**
     * Get or set a state value.
     *
     * This is a base method and will not invoke related changes, for example
     * setting selected=false will not trigger any deselection logic.
     *
     * @category TreeNode
     * @param {string} name Property name.
     * @param {boolean} newVal New value, if setting.
     * @return {TreeNode} Node object.
     */
    state(name: string, newVal?: boolean) {
        var oldVal = this.itree.state[name];

        if (typeof newVal !== 'undefined' && oldVal !== newVal) {
            // Update values
            this.itree.state[name] = newVal;
            this.markDirty();

            // Emit an event
            this._tree.emit('node.state.changed', this, name, oldVal, newVal);
        }

        return this.itree.state[name];
    }

    /**
     * Mark this node as "removed" without actually removing it.
     *
     * Expand/show methods will never reveal this node until restored.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    softRemove() {
        return this._tree.baseStateChange('removed', true, 'softremoved', this, 'softRemove');
    }

    /**
     * Toggles collapsed state.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    toggleCollapse() {
        return (this.collapsed() ? this.expand() : this.collapse());
    }

    /**
     * Toggles selected state.
     *
     * @category TreeNode
     * @return {TreeNode} Node object.
     */
    toggleSelect() {
        return (this.selected() ? this.deselect() : this.select());
    }

    /**
     * Export this node as a native Object.
     *
     * @category TreeNode
     * @return {object} Node object.
     */
    toObject() {
        var object: { children: Array<any>; } = { children: [] }

        _.each(this, function(value, property) {
            if (property !== '_tree') {
                object[property] = value;
            }
        });

        if (this.hasChildren() && _.isFunction(this.children.toArray)) {
            object.children = this.children.toArray();
        }

        return object;
    }

    /**
     * Checks whether a node is visible to a user. Returns false
     * if it's hidden, or if any ancestor is hidden or collapsed.
     *
     * @category TreeNode
     * @param {object} node Node object.
     * @return {boolean} Whether visible.
     */
    visible() {
        var node = this;

        var isVisible = true;
        if (node.hidden() || node.removed()) {
            isVisible = false;
        }
        else if (node.hasParent()) {
            if (node.getParent().collapsed()) {
                isVisible = false;
            }
            else {
                isVisible = node.getParent().visible();
            }
        }
        else {
            isVisible = true;
        }

        return isVisible;
    }
}
