/** @namespace x3dom.nodeTypes */
/*
 * X3DOM JavaScript Library
 * http://www.x3dom.org
 *
 * (C)2009 Fraunhofer IGD, Darmstadt, Germany
 * (C)2025 Andreas Plesch, Waltham, MA, U.S.A
 * Dual licensed under the MIT and GPL
 */

/* ### GeoTileset ### */
x3dom.registerNodeType(
    "GeoTileset",
    "Geospatial",
    defineClass( x3dom.nodeTypes.X3DGroupingNode,

        /**
         * Constructor for GeoTileset
         * @constructs x3dom.nodeTypes.GeoTileset
         * @x3d 4.1
         * @component Geospatial
         * @status experimental
         * @extends x3dom.nodeTypes.X3DBoundedObject
         * @param {Object} [ctx=null] - context object, containing initial settings like namespace
         * @classdesc The GeoTileset node loads OGC 3d Tilesets from a url.
         */
        function ( ctx )
        {
            x3dom.nodeTypes.GeoTileset.superClass.call( this, ctx );

            /**
             * The geoSystem field is used to define the spatial reference frame. Not used.
             * @var {x3dom.fields.MFString} geoSystem
             * @range {["GD", ...], ["UTM", ...], ["GC", ...]}
             * @memberof x3dom.nodeTypes.GeoTileset
             * @initvalue ['GD','WE']
             * @field x3d
             * @instance
             */
            // The content of the Tileset is always expected to be given in GC
            //this.addField_MFString( ctx, "geoSystem", [ "GD", "WE" ] );

            /**
             * The rootUrl specifies the json or x3d file for the tileset.
             * @var {x3dom.fields.MFString} rootUrl
             * @memberof x3dom.nodeTypes.GeoTileset
             * @initvalue []
             * @field x3dom
             * @instance
             */
            this.addField_MFString( ctx, "rootUrl", [] );

            /**
             * The geoOrigin field is used to specify a local coordinate frame for extended precision.
             * @var {x3dom.fields.SFNode} geoOrigin
             * @memberof x3dom.nodeTypes.GeoTileset
             * @initvalue x3dom.nodeTypes.X3DChildNode
             * @field x3d
             * @instance
             */
            this.addField_SFNode( "geoOrigin", x3dom.nodeTypes.GeoOrigin );

            this._ctx = ctx;

            this._loaded = new Map();

            this._load = x3dom.loaders.core.load;
            this._Tiles3DLoader = x3dom.loaders["3d-tiles"].Tiles3DLoader;
            this._Tileset3D = x3dom.loaders.tiles.Tileset3D;
            this._Viewport = x3dom.deck.core.Viewport;
            this._WebMercatorViewport = x3dom.deck.core.WebMercatorViewport;//x3dom.deck.core.WebMercatorViewport;

            this._geoOriginTransform = new x3dom.nodeTypes.GeoTransform( this._ctx );
            this._geoOriginTransform._cf.geoOrigin = this._cf.geoOrigin;
            this._geoOriginTransform._vf.globalGeoOrigin = true;
            this._geoOriginTransform.nodeChanged();
            this.addChild( this._geoOriginTransform );
        },
        {
            _collectDrawableObjects : function ( transform, drawableCollection, singlePath, invalidateCache, planeMask, clipPlanes )
            {
                if ( singlePath && ( this._parentNodes.length > 1 ) )
                {singlePath = false;}
                if ( singlePath && ( invalidateCache = invalidateCache || this.cacheInvalid() ) )
                {this.invalidateCache();}

                this.collectBbox( transform, drawableCollection, singlePath, invalidateCache, planeMask, clipPlanes );

                planeMask = drawableCollection.cull( transform, this.graphState(), singlePath, planeMask );
                if ( planeMask <= 0 )
                {
                    return;
                }
                // at the moment, no caching here as children may change every frame
                singlePath = false;
                this.visitChildren( transform, drawableCollection, singlePath, invalidateCache, planeMask, clipPlanes );
            },

            visitChildren : function ( transform, drawableCollection, singlePath, invalidateCache, planeMask, clipPlanes )
            {
                var i = 0,
                    n = 0,
                    cnodes,
                    cnode;
                var mat_view = drawableCollection.viewMatrix;
                var center = new x3dom.fields.SFVec3f( 0, 0, 0 ); // eye
                center = mat_view.inverse().multMatrixPnt( center );
                //transform eye point to the LOD node's local coordinate system
                this._eye = transform.inverse().multMatrixPnt( center );
                var len = this._x3dcenter.subtract( this._eye ).length();

                //TODO: preload when close = 0.9 * range
                //- just load but do not add to drawables
                //- then at range just add to drawable
                //TODO: unload inlines if out of range and after (configurable) timeout (1 minute?)
                // - loaded = false and childurlnodes = null, childurlnodes = new mfnode should suffice ?

                if ( len > this._vf.range )
                {
                    i = 0;
                    if ( !this._rootNodeLoaded )
                    {
                        this._rootNodeLoaded = true;
                    }
                    //rootNode already has rootUrl node if empty, see nodeChanged()
                    cnodes = this._cf.rootNode.nodes;
                }

                else
                {
                    i = 1;
                    if ( !this._child1added )
                    {
                        this._child1added = true;
                        this.addInlineChild( this._vf.child1Url );
                    }
                    if ( !this._child2added )
                    {
                        this._child2added = true;
                        this.addInlineChild( this._vf.child2Url );
                    }
                    if ( !this._child3added )
                    {
                        this._child3added = true;
                        this.addInlineChild( this._vf.child3Url );
                    }
                    if ( !this._child4added )
                    {
                        this._child4added = true;
                        this.addInlineChild( this._vf.child4Url );
                    }

                    if ( this._rootNodeLoaded )
                    {
                        this._rootNodeLoaded = false;
                        //never null rootNode (?)
                    }

                    cnodes = this._childUrlNodes.nodes;
                }

                if ( i !== this._lastRangePos )
                {
                    //x3dom.debug.logInfo('Changed from '+this._lastRangePos+' th range to '+i+' th.');
                    this.postMessage( "level_changed", i );
                }

                this._lastRangePos = i;

                n = cnodes.length;

                //probably not necessary to check if there are any child nodes
                if ( n && cnodes )
                {
                    var childTransform = this.transformMatrix( transform );

                    /* not in original LOD, may work for GeoLOD as well

                        if (x3dom.nodeTypes.ClipPlane.count > 0) {
                            var localClipPlanes = [];
                            for (var j = 0; j < n; j++) {
                                if ( (cnode = this._childNodes[j]) ) {
                                    if (x3dom.isa(cnode, x3dom.nodeTypes.ClipPlane) && cnode._vf.on && cnode._vf.enabled) {
                                        localClipPlanes.push({plane: cnode, trafo: childTransform});
                                    }
                                }
                            }
                            clipPlanes = localClipPlanes.concat(clipPlanes);
                        }
                        */

                    for ( i = 0; i < n; i++ )
                    {
                        if ( ( cnode = cnodes[ i ] ) )
                        {
                            cnode.collectDrawableObjects( childTransform, drawableCollection, singlePath, invalidateCache, planeMask, clipPlanes );
                        }
                    }
                }
            },

            addInlineChild : function ( url )
            {
                //check if url empty
                var inline = this.newInlineNode( url );
                this._childUrlNodes.addLink( inline );
            },

            newInlineNode : function ( url )
            {
                var inline = new x3dom.nodeTypes.Inline();
                inline._vf.url = url;
                inline._nameSpace = this._nameSpace; // pass on nameSpace
                //inline.initDone = false; // these need to be initialized?
                //inline.count = 0;
                //inline.numRetries = x3dom.nodeTypes.Inline.MaximumRetries;
                x3dom.debug.logInfo( "add url: " + url );
                inline.nodeChanged(); //is necessary and loads the inline scene
                return inline;
            },

            getVolume : function ()
            {
                var vol = this._graph.volume;
                //below may not apply for GeoLOD
                if ( !this.volumeValid() && ( this._vf.bboxDisplay || this.renderFlag && this.renderFlag() ) )
                {
                    var child,
                        childVol;
                    // use childUrlNodes ?
                    for ( var i = 0, n = this._childNodes.length; i < n; i++ )
                    {
                        if ( !( child = this._childNodes[ i ] ) || child.renderFlag && child.renderFlag() !== true  && !child._vf.bboxDisplay )
                        {continue;}
                        childVol = child.getVolume();
                        if ( childVol && childVol.isValid() )
                        {vol.extendBounds( childVol.min, childVol.max );}
                    }
                    //}
                }
                return vol;
            },

            nodeChanged : function ()
            {
                //this._needReRender = true;
                let tilesetJson = this._xmlNode._tilesetJson; // may have been provided by GeoOGC3DTileset
                let tilesetJsonPromise;
                if ( tilesetJson )
                {
                    tilesetJsonPromise = Promise.resolve( tilesetJson );
                }
                else
                {  
                    tilesetJsonPromise = this._load(
                        this._vf.rootUrl[0], this._Tiles3DLoader, { '3d-tiles': {isTileset: true} } );
                }
                var that = this;
                tilesetJsonPromise.then( 
                    function fullfilled ( tilesetJson )
                    {
                        console.log( tilesetJson );
                        const tileset3d = new that._Tileset3D( tilesetJson,
                            {
                                throttleRequests: false,
                                onTileLoad: that._onTileLoad.bind( that )
                            });
                        let rt = that._nameSpace.doc._x3dElem.runtime;
                        const viewportOpts = {
                            width: rt.getWidth(),
                            height: rt.getHeight(),
                            latitude: tileset3d.cartographicCenter[1],
                            longitude: tileset3d.cartographicCenter[0],
                            pitch: 2, // from vertical
                            bearing: 10, // from N ccw
                            zoom: 14, // size=360/2^zoom; 360/size=2^zoom; zoom=ln2(360/size);
                            // nearZ: 0.59679,
                            // farZ: 5967.85292
                            // projectionMatrix: rt.projectionMatrix().toGL()
                        };
                        let zoom = that.getZoomFromElevation( {
                            elevation: 7500,
                            latitude: viewportOpts.latitude,
                            height: viewportOpts.height
                        } );
                        console.log ( zoom );
                        that.viewport = new that._WebMercatorViewport( viewportOpts );
                        tileset3d.update ( that.viewport );
                        console.log ( tileset3d );
                        return tileset3d.selectTiles ( that.viewport );
                    },
                    function rejected ( reason )
                    {
                        x3dom.debug.logInfo ( ' Tileset rejected: ' + reason );
                        // try next url
                    }
                );

                //only rootNodes are ever shapes; childUrls have their own rootNodes
                //append rootnode field with inline rooturl if empty
                // if ( !this._cf.rootNode.nodes.length )
                // {
                //     var inline = this.newInlineNode( this._vf.rootUrl );
                //     this._cf.rootNode.addLink( inline );
                // }

                this.invalidateVolume();
            },

            _onTileLoad : function ( tile )
            {
                console.log ( tile );
                //if ( this._loaded.has( tile.id ) ) return
                this._loaded.set( tile.id, "loaded");
                
                if ( tile.hasTilesetContent ) // needs another update to continue to traverse
                {
                    tile.tileset.update ( this.viewport ); // kicks off next onTileLoad call
                    return;
                }

                const tileCtx =
                {
                    doc       : this._ctx.doc,
                    runtime   : this._ctx.runtime,
                    xmlNode   : this._ctx.xmlNode.cloneNode( true ), // overwritten
                    nameSpace : this._ctx.nameSpace
                };

                tileCtx.xmlNode = document.createElement('Transform');
                let glTFTransform = new x3dom.nodeTypes.Transform( tileCtx );
                glTFTransform._vf.rotation = x3dom.fields.Quaternion.parseAxisAngle( "1 0 0 " + Math.PI/2 );
                glTFTransform.fieldChanged("rotation"); //applies to trafo  
                
                tileCtx.xmlNode = document.createElement('Inline');
                let glTFInline = new x3dom.nodeTypes.Inline( tileCtx );
                glTFInline._vf.url = x3dom.fields.MFString.parse( tile.contentUrl );
                glTFInline.nodeChanged(); //is necessary and loads the inline scene

                glTFTransform.addChild( glTFInline ); 
                glTFTransform.nodeChanged(); //is necessary
                
                tileCtx.xmlNode = document.createElement('MatrixTransform');
                let tileTransform = new x3dom.nodeTypes.MatrixTransform( tileCtx );
                tileTransform._vf.matrix = x3dom.fields.SFMatrix4f.fromArray( tile.computedTransform ).transpose();
                tileTransform.fieldChanged("matrix"); //applies to trafo
                //tileTransform._trafo.setFromArray ( tile.computedTransform ); //shortcut works but does not update field  
                tileTransform.addChild( glTFTransform ); 
                tileTransform.nodeChanged();

                this._geoOriginTransform.addChild( tileTransform ); 
                this._geoOriginTransform.nodeChanged(); //is necessary and loads the inline scene
                
                //this.nodeChanged();
                this.invalidateVolume();
            },

            _fieldChanged : function ( fieldName )
            {
                //this._needReRender = true;
                if ( fieldName == "render" || fieldName == "range" )
                {
                    this.invalidateVolume();
                }
                if ( fieldname == "center" )
                {
                    var coords = new x3dom.fields.MFVec3f();
                    coords.push( this._vf.center );
                    this._x3dcenter = x3dom.nodeTypes.GeoCoordinate.prototype.GEOtoX3D( this._vf.geoSystem, this._cf.geoOrigin, coords )[ 0 ];

                    this.invalidateVolume();
                }
            },

            getMeterZoom: function ( latitude ) {
                const latCosine = Math.cos(latitude * Math.PI/180);
                const EARTH_CIRCUMFERENCE = 40.03e6;
                return this.scaleToZoom(EARTH_CIRCUMFERENCE * latCosine) - 9;
            },

            scaleToZoom: function (scale) {
                return Math.log2(scale);
            },

            fovyToAltitude: function (fovy) {
                return 0.5 / Math.tan(0.5 * fovy * Math.PI/180);
            },

            /**
             * Returns the zoom level that will position the camera at the given elevation above the ground.
             * Can be used to create a WebMercatorViewport from a camera at a known physical elevation (e.g. for 3D tileset traversal).
             *
             * @param options
             * @param options.elevation - Physical camera elevation in meters above the ground
             * @param options.latitude - Latitude of the viewport center in degrees
             * @param options.height - Height of the viewport in pixels
             * @param options.pitch - Tilt of the camera in degrees. Default `0`
             * @param options.fovy - Camera field of view in degrees. If provided, overrides `altitude`
             * @param options.altitude - Camera altitude relative to the viewport height. Default `1.5`
             * @returns Zoom level for use in WebMercatorViewport
             */
            getZoomFromElevation: function getZoomFromElevation( options = {
                elevation: 0,
                latitude: 0,
                height: 0,
                pitch: 0,
                fovy: null,
                altitude: 1.5
                }) {
                    const {elevation, latitude, height, pitch = 0, fovy, altitude = 1.5} = options;
                    const altitudeRatio = fovy ? fovyToAltitude(fovy) : altitude;
                    return (
                        this.getMeterZoom(latitude) +
                            Math.log2((altitudeRatio * Math.cos(pitch * (Math.PI / 180)) * height) / elevation)
                    );
            },

            /**
             * Returns the camera elevation in meters for the given zoom level.
             * This is the inverse of `getZoomFromElevation`.
             *
             * @param options
             * @param options.zoom - Zoom level
             * @param options.latitude - Latitude of the viewport center in degrees
             * @param options.height - Height of the viewport in pixels
             * @param options.pitch - Tilt of the camera in degrees. Default `0`
             * @param options.fovy - Camera field of view in degrees. If provided, overrides `altitude`
             * @param options.altitude - Camera altitude relative to the viewport height. Default `1.5`
             * @returns Camera elevation in meters above the ground
             */
            getElevationFromZoom: function getElevationFromZoom(options = {
                zoom: 0,
                latitude: 0,
                height: 0,
                pitch: 0,
                fovy: null,
                altitude: 1.5
            }) {
            const {zoom, latitude, height, pitch = 0, fovy, altitude = 1.5} = options;
            const altitudeRatio = fovy ? this.fovyToAltitude(fovy) : altitude;
            return (
                (altitudeRatio * Math.cos(pitch * (Math.PI / 180)) * height) /
                Math.pow(2, zoom - this.getMeterZoom(latitude))
            );
            }
        }
    )
);
