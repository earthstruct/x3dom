/** @namespace x3dom.nodeTypes */
/*
 * X3DOM JavaScript Library
 * http://www.x3dom.org
 *
 * (C)2009 Fraunhofer IGD, Darmstadt, Germany
 * (C)2025 Andreas Plesch, Waltham, MA, U.S.A
 * Dual licensed under the MIT and GPL
 */

/* ### GeoOGC3DTiles ### */
x3dom.registerNodeType(
    "GeoOGC3DTiles",
    "Geospatial",
    defineClass( x3dom.nodeTypes.X3DTransformNode,

        /**
         * Constructor for GeoOGC3DTiles
         * @constructs x3dom.nodeTypes.GeoOGC3DTiles
         * @x3d 4.1
         * @component Geospatial
         * @status experimental
         * @extends x3dom.nodeTypes.X3DTransformNode
         * @param {Object} [ctx=null] - context object, containing initial settings like namespace
         * @classdesc The GeoOGC3DTiles node loads a OGC 3d Tileset from a url. It constructs a GeoTileset
         * which is available from the SFNode tileset field. The constructed node is a child node.
         */
        function ( ctx )
        {
            x3dom.nodeTypes.GeoOGC3DTiles.superClass.call( this, ctx );

            /**
             * The url specifies the json file for the tileset.
             * @var {x3dom.fields.MFString} url
             * @memberof x3dom.nodeTypes.GeoOGC3DTiles
             * @initvalue []
             * @field x3dom
             * @instance
             */
            this.addField_MFString( ctx, "url", [] );

            /**
             * The geoOrigin field is used to specify a local coordinate frame for extended precision.
             * @var {x3dom.fields.SFNode} geoOrigin
             * @memberof x3dom.nodeTypes.GeoOGC3DTiles
             * @initvalue x3dom.nodeTypes.X3DChildNode
             * @field x3d
             * @instance
             */
            this.addField_SFNode( "geoOrigin", x3dom.nodeTypes.GeoOrigin );

            /**
             * The read-only tileset field holds the tile tree of the OGC tileset.
             * @var {x3dom.fields.SFNode} tileset
             * @memberof x3dom.nodeTypes.GeoOGC3DTiles
             * @initvalue x3dom.nodeTypes.X3DChildNode
             * @field x3d
             * @instance
             */
            this.addField_SFNode( "tileset", x3dom.nodeTypes.GeoTileset );

            //this._ctx = ctx;

            this._trafo = new x3dom.fields.SFMatrix4f();

            this._loaded = new Map();

            this._load = x3dom.loaders.core.load;
            this._Tiles3DLoader = x3dom.loaders["3d-tiles"].Tiles3DLoader;
        },
        {
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
                if ( this._loaded.has( this._vf.url[0] ) ) return;
                const tilesetJsonPromise = this._load(
                    this._vf.url[0], this._Tiles3DLoader, {'3d-tiles': {isTileset: true}});
                var that = this;
                tilesetJsonPromise.then( 
                    function fullfilled ( tilesetJson )
                    {
                        console.log( tilesetJson );
                        that._loaded.set( that._vf.url[0], "loaded" );

                        let tilesetDOM = document.createElement('GeoTileset');
                        tilesetDOM.setAttribute( "containerField", "tileset" );
                        tilesetDOM.setAttribute( "geometricError", tilesetJson.geometricError );
                        tilesetDOM._tilesetJson = tilesetJson; // avoid refetching

                        // metadata

                        let metadataSet = document.createElement( "MetadataSet" );
                        metadataSet.setAttribute( "name", "OGC 3D Tiles" );
                        metadataSet.setAttribute( "reference", "https://www.ogc.org/standards/3dtiles/" );
                        metadataSet.setAttribute( "containerField", "metadata" );
                        tilesetDOM.appendChild( metadataSet );

                        metadataSet.appendChild( _createMetadataString ( "asset.version", `"${tilesetJson?.asset?.version}"` ) );
                        metadataSet.appendChild( _createMetadataString ( "asset.tilesetVersion", `"${tilesetJson?.asset?.tilesetVersion}"` ) );
                        //...
                        //reuse glTF metadata parser

                        function _createMetadataString( name, value )
                        {
                            let metadata = document.createElement( 'MetadataString' );
                            metadata.setAttribute( "name", name );
                            metadata.setAttribute( "value", value );
                            return metadata;
                        }

                        // GeoOrigin
                        // pass on, but better to set this._trafo here
                        let geoOrigin = that._cf.geoOrigin.node;
                        if ( geoOrigin )
                        {
                            let geoOriginClone = geoOrigin._xmlNode.cloneNode();
                            geoOriginClone.setAttribute( "containerField", "geoOrigin" );
                            tilesetDOM.appendChild( geoOriginClone );
                        }
                        
                        // root
                        // if GeoTileset is given json it constructs its own root tile node from it

                        //trigger update
                        that._xmlNode.appendChild( tilesetDOM );
                    },
                    function rejected ( reason )
                    {
                        x3dom.debug.logInfo ( ' Tileset rejected: ' + reason );
                        // try next url
                    }
                );

                //this.invalidateVolume();
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
            }
        }
    )
);
