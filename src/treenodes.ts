'use strict';

// Libs
import * as _ from 'lodash';
import InspireTree from './tree';
import { Promise } from 'es6-promise';
import { recurseDown } from './lib/recurse-down';
import { TreeNode } from './treenode';

var baseStatePredicate = function(state, full) {
    if (full) {
        return this.extract(state);
    }

    // Cache a state predicate function
    var fn = this.getPredicateFunction(state);

    return this.flatten(function(node) {
        // Never include removed nodes unless specifically requested
        if (state !== 'removed' && node.removed()) {
            return false;
        }

        return fn(node);
    });
};

/**
 * An Array-like collection of TreeNodes.
 *
 * @category TreeNodes
 * @param {array} array Array of TreeNode objects.
 * @return {TreeNodes} Collection of TreeNode
 */
export class TreeNodes extends Array {
    private _tree: InspireTree;
    _context: TreeNode;

    constructor(tree: InspireTree);
    constructor(tree: InspireTree, array: Array<TreeNode> | TreeNodes)
    constructor(tree: InspireTree, array?: Array<TreeNode> | TreeNodes) {
        super();
        this._tree = tree;

        var treeNodes = this;
        if (_.isArray(array) || array instanceof TreeNodes) {
            _.each(array, function(node) {
                if (node instanceof TreeNode) {
                    treeNodes.push(node.clone());
                }
            });
        }
    }

    /**
     * Adds a new node to this collection. If a sort
     * method is configured, the node will be added
     * in the appropriate order.
     *
     * @category TreeNodes
     * @param {object} object Node
     * @return {TreeNode} Node object.
     */
    addNode(object) {
        // Base insertion index
        var index = this.length;

        // If tree is sorted, insert in correct position
        if (this._tree.config.sort) {
            index = _.sortedIndexBy(this, object, this._tree.config.sort);
        }

        return this.insertAt(index, object);
    }

    /**
     * Query for all available nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    available(full) {
        return baseStatePredicate.call(this._tree, 'available', full);
    }

    /**
     * Blur children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    blur() {
        return this.invoke('blur');
    }

    /**
     * Blur all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    blurDeep() {
        return this.invokeDeep('blur');
    }

    /**
     * Clean children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    clean() {
        return this.invoke('clean');
    }

    /**
     * Clones (deep) the array of nodes.
     *
     * Note: Cloning will *not* clone the context pointer.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of cloned nodes.
     */
    clone() {
        return new TreeNodes(this._tree, this);
    }

    /**
     * Collapse children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    collapse() {
        return this.invoke('collapse');
    }

    /**
     * Query for all collapsed nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    collapsed(full) {
        return baseStatePredicate.call(this._tree, 'collapsed', full);
    }

    /**
     * Collapse all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    collapseDeep() {
        return this.invokeDeep('collapse');
    }

    /**
     * Concat nodes like an Array would.
     *
     * @category TreeNodes
     * @param {TreeNodes} nodes Array of nodes.
     * @return {TreeNodes} Resulting node array.
     */
    concat(nodes) {
        var newNodes = new TreeNodes(this._tree);
        newNodes._context = this._context;

        var pusher = function(node, key) {
            if (node instanceof TreeNode) {
                newNodes.push(node);
            }
        };

        _.each(this, pusher);
        _.each(nodes, pusher);

        return newNodes;
    }

    /**
     * Get the context of this collection. If a collection
     * of children, context is the parent node. Otherwise
     * the context is the tree itself.
     *
     * @category TreeNodes
     * @return {TreeNode|object} Node object or tree instance.
     */
    context() {
        return this._context || this._tree;
    }

    /**
     * Copies nodes to a new tree instance.
     *
     * @category TreeNodes
     * @param {boolean} hierarchy Include necessary ancestors to match hierarchy.
     * @return {object} Methods to perform action on copied nodes.
     */
    copy(hierarchy) {
        var nodes = this;

        return {

            /**
             * Sets a destination.
             *
             * @category CopyNode
             * @param {object} dest Destination Inspire Tree.
             * @return {array} Array of new nodes.
             */
            to: function(dest) {
                if (!_.isFunction(dest.addNodes)) {
                    throw new Error('Destination must be an Inspire Tree instance.');
                }

                var newNodes = new TreeNodes(this._tree);

                _.each(nodes, function(node) {
                    newNodes.push(node.copy(hierarchy).to(dest));
                });

                return newNodes;
            }
        };
    }

    /**
     * Returns deepest nodes from this array.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    deepest() {
        var matches = new TreeNodes(this._tree);

        this.recurseDown(function(node) {
            if (!node.children) {
                matches.push(node);
            }
        });

        return matches;
    }

    /**
     * Deselect children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    deselect() {
        return this.invoke('deselect');
    }

    /**
     * Deselect all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    deselectDeep() {
        return this.invokeDeep('deselect');
    }

    /**
     * Iterate every TreeNode in this collection.
     *
     * @category TreeNodes
     * @param {function} iteratee Iteratee invoke for each node.
     * @return {TreeNodes} Array of node objects.
     */
    each(iteratee) {
        _.each(this, iteratee);

        return this;
    }

    /**
     * Expand children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    expand() {
        return this.invoke('expand');
    }

    /**
     * Query for all expanded nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    expanded(full) {
        return baseStatePredicate.call(this._tree, 'expanded', full);
    }

    /**
     * Recursively expands all nodes, loading all dynamic calls.
     *
     * @category TreeNodes
     * @return {Promise} Promise resolved only when all children have loaded and expanded.
     */
    expandDeep() {
        var nodes = this;

        return new Promise(function(resolve) {
            var waitCount = 0;

            var done = function() {
                if (--waitCount === 0) {
                    resolve(nodes);
                }
            };

            nodes.recurseDown(function(node) {
                waitCount++;

                // Ignore nodes without children
                if (node.children) {
                    node.expand().catch(done).then(function() {
                        // Manually trigger expansion on newly loaded children
                        node.children.expandDeep().catch(done).then(done);
                    });
                }
                else {
                    done();
                }
            });
        });
    }

    /**
     * Expand parents of children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    expandParents() {
        return this.invoke('expandParents');
    }

    /**
     * Clones an array of node objects and removes any
     * itree instance information/state.
     *
     * @category TreeNodes
     * @return {array} Array of node objects.
     */
    export() {
        var clones = [];

        _.each(this, function(node) {
            clones.push(node.export());
        });

        return clones;
    }

    /**
     * Returns a cloned hierarchy of all nodes matching a predicate.
     *
     * Because it filters deeply, we must clone all nodes so that we
     * don't affect the actual node array.
     *
     * @category TreeNodes
     * @param {string|function} predicate State flag or custom function.
     * @return {TreeNodes} Array of node objects.
     */
    extract(predicate) {
        var flat = this.flatten(predicate);
        var matches = new TreeNodes(this._tree);

        _.each(flat, function(node) {
            matches.addNode(node.copyHierarchy());
        });

        return matches;
    }

    /**
     * Returns nodes which match a predicate.
     *
     * @category TreeNodes
     * @param {string|function} predicate State flag or custom function.
     * @return {TreeNodes} Array of node objects.
     */
    filter(predicate) {
        var fn = this._tree.getPredicateFunction(predicate);
        var matches = new TreeNodes(this._tree);

        _.each(this, function(node) {
            if (fn(node)) {
                matches.push(node);
            }
        });

        return matches;
    }

    /**
     * Flattens a hierarchy, returning only node(s) matching the
     * expected state or predicate function.
     *
     * @category TreeNodes
     * @param {string|function} predicate State property or custom function.
     * @return {TreeNodes} Flat array of matching nodes.
     */
    flatten(predicate) {
        var flat = new TreeNodes(this._tree);

        var fn = this._tree.getPredicateFunction(predicate);
        this.recurseDown(function(node) {
            if (fn(node)) {
                flat.push(node);
            }
        });

        return flat;
    }

    /**
     * Query for all focused nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    focused(full) {
        return baseStatePredicate.call(this._tree, 'focused', full);
    }

    /**
     * Get a specific node in the collection, or undefined if it doesn't exist.
     *
     * @category TreeNodes
     * @param {int} index Numeric index of requested node.
     * @return {TreeNode} Node object. Undefined if invalid index.
     */
    get(index) {
        return this[index];
    }

    /**
     * Query for all hidden nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    hidden(full) {
        return baseStatePredicate.call(this._tree, 'hidden', full);
    }

    /**
     * Hide children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    hide() {
        return this.invoke('hide');
    }

    /**
     * Hide all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    hideDeep() {
        return this.invokeDeep('hide');
    }

    /**
     * Query for all indeterminate nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    indeterminate(full) {
        return baseStatePredicate.call(this._tree, 'indeterminate', full);
    }

    /**
     * Insert a new node at a given position.
     *
     * @category TreeNodes
     * @param {integer} index Index at which to insert the node.
     * @param {object} object Raw node object or TreeNode.
     * @return {TreeNode} Node object.
     */
    insertAt(index: number, object: any) {
        // If node has a pre-existing ID
        if (object.id) {
            // Is it already in the tree?
            var existingNode = this.node(object.id);
            if (existingNode) {
                existingNode.restore().show();

                // Merge children
                if (_.isArrayLike(object.children)) {
                    // Setup existing node's children property if needed
                    if (!_.isArrayLike(existingNode.children)) {
                        existingNode.children = new TreeNodes(this._tree);
                        existingNode.children._context = existingNode;
                    }

                    // Copy each child (using addNode, which uses insertAt)
                    _.each(object.children, function(child) {
                        existingNode.children.addNode(child);
                    });
                }

                // Merge truthy children
                else if (object.children && _.isBoolean(existingNode.children)) {
                    existingNode.children = object.children;
                }

                existingNode.markDirty();
                this._tree.dom.applyChanges();

                // Node merged, return it.
                return existingNode;
            }
        }

        // Node is new, insert at given location.
        var node = this._tree.isNode(object) ? object : this._tree.objectToModel(object);

        // Insert
        this.splice(index, 0, node);

        // Refresh parent state and mark dirty
        if (this._context) {
            node.itree.parent = this._context;
            this._context.refreshIndeterminateState().markDirty();
        }

        // Event
        this._tree.emit('node.added', node);

        node.markDirty();
        this._tree.dom.applyChanges();

        return node;
    }

    /**
     * Invoke method(s) on each node.
     *
     * @category TreeNodes
     * @param {string|array} methods Method name(s).
     * @return {TreeNodes} Array of node objects.
     */
    invoke(methods) {
        return this._tree.baseInvoke(this, methods);
    }

    /**
     * Invoke method(s) deeply.
     *
     * @category TreeNodes
     * @param {string|array} methods Method name(s).
     * @return {TreeNodes} Array of node objects.
     */
    invokeDeep(methods) {
        return this._tree.baseInvoke(this, methods, true);
    }

    /**
     * Query for all loading nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    loading(full) {
        return baseStatePredicate.call(this._tree, 'loading', full);
    }

    /**
     * Get a node.
     *
     * @category TreeNodes
     * @param {string|number} id ID of node.
     * @return {TreeNode} Node object.
     */
    node(id) {
        var match;

        if (_.isNumber(id)) {
            id = id.toString();
        }

        this.recurseDown(function(node) {
            if (node.id === id) {
                match = node;

                return false;
            }
        });

        return match;
    }

    /**
     * Get all nodes in a tree, or nodes for an array of IDs.
     *
     * @category Tree
     * @param {array} refs Array of ID references.
     * @return {TreeNodes} Array of node objects.
     * @example
     *
     * var all = tree.nodes()
     * var some = tree.nodes([1, 2, 3])
     */
    nodes(refs) {
        var results;

        if (_.isArray(refs)) {
            // Ensure incoming IDs are strings
            refs = _.map(refs, function(element) {
                if (_.isNumber(element)) {
                    element = element.toString();
                }

                return element;
            });

            results = new TreeNodes(this._tree);

            this.recurseDown(function(node) {
                if (refs.indexOf(node.id) > -1) {
                    results.push(node);
                }
            });
        }

        return _.isArray(refs) ? results : this;
    }

    /**
     * Iterate down all nodes and any children.
     *
     * @category TreeNodes
     * @param {function} iteratee Iteratee function.
     * @return {TreeNodes} Resulting nodes.
     */
    recurseDown(iteratee) {
        recurseDown(this, iteratee);

        return this;
    }

    /**
     * Query for all soft-removed nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    removed(full) {
        return baseStatePredicate.call(this._tree, 'removed', full);
    }

    /**
     * Restore children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    restore() {
        return this.invoke('restore');
    }

    /**
     * Restore all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    restoreDeep() {
        return this.invokeDeep('restore');
    }

    /**
     * Select children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    select() {
        return this.invoke('select');
    }

    /**
     * Query for all selectable nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    selectable(full) {
        return baseStatePredicate.call(this._tree, 'selectable', full);
    }

    /**
     * Select all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    selectDeep() {
        return this.invokeDeep('select');
    }

    /**
     * Query for all selected nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    selected(full) {
        return baseStatePredicate.call(this._tree, 'selected', full);
    }

    /**
     * Show children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    show() {
        return this.invoke('show');
    }

    /**
     * Show all children (deeply) in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    showDeep() {
        return this.invokeDeep('show');
    }

    /**
     * Soft-remove children in this collection.
     *
     * @category TreeNodes
     * @return {TreeNodes} Array of node objects.
     */
    softRemove() {
        return this.invoke('softRemove');
    }

    /**
     * Sorts all TreeNode objects in this collection.
     *
     * If no custom sorter given, the configured "sort" value will be used.
     *
     * @category TreeNodes
     * @param {string|function} sorter Sort function or property name.
     * @return {TreeNodes} Array of node obejcts.
     */
    sort(sorter) {
        var nodes = this;
        sorter = sorter || this._tree.config.sort;

        // Only apply sort if one provided
        if (sorter) {
            var sorted = _.sortBy(nodes, sorter);

            nodes.length = 0;
            _.each(sorted, function(node) {
                nodes.push(node);
            });
        }

        return nodes;
    }

    /**
     * Chained method for returning a chain to the tree context.
     *
     * @category TreeNodes
     * @return {[type]} [description]
     */
    tree() {
        return this._tree;
    }

    /**
     * Returns a native Array of nodes.
     *
     * @category TreeNodes
     * @return {array} Array of node objects.
     */
    toArray() {
        var array = [];

        _.each(this, function(node, key) {
            array.push(node.toObject());
        });

        return array;
    }

    /**
     * Query for all visible nodes.
     *
     * @category TreeNodes
     * @param {boolean} full Retain full hiearchy.
     * @return {TreeNodes} Array of node objects.
     */
    visible(full) {
        return baseStatePredicate.call(this._tree, 'visible', full);
    }
};
