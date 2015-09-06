var gl, can;
var CAN_ID = 'glcanvas';    // canasid
var CAN_SIZE = 512;         // キャンバスサイズ
var pos_x = 0.0, pos_y = 0.0;
var fbuffer = [];           // オフスクリーン用のバッファ
var ftexture = [];          // オフスクリーン用のテクスチャ
var program = [];           // プログラムオブジェクト
var draw_scale = 0.4;       // 円描画してるスケール
var draw_angle = 36;        // 円描画する三角形の数

// サークル計算用（オーバーフロー防止用）
Math.Sin = function(w){
    return Math.round(Math.sin(w) * 100) / 100;
};
Math.Cos = function(w){
    return Math.round(Math.cos(w) * 100) / 100;
};

// マウスムーブ処理
function mouseMove(e){
    var cw = can.width;
    var ch = can.height;
    var wh = 1 / Math.sqrt(cw * cw + ch * ch);
    var x = e.clientX - can.offsetLeft - cw * 0.5;
    var y = e.clientY - can.offsetTop - ch * 0.5;
    // x,yのマウス位置を正規化(-1.0〜1.0の間)し、スケール時の動きの遅さにも対応した
    pos_x = x/(cw/2) / draw_scale;
    pos_y = y/(ch/2) / draw_scale;
}

// マウスホイール処理
function mouseWheel(e){
    draw_scale += e.wheelDelta * 0.001;
}


// JavaScriptで発生したエラーを取得
window.onerror = function(msg, url, line, col, error) {
    var errmsg = "file:" + url + "<br>line:" + line + " " + msg;
    Simple.myerror(errmsg);
}

window.onload = function(){
    Simple();
}

var Simple = function() {
    // Live2Dモデルのインスタンス
    this.live2DModel = null;
    // アニメーションを停止するためのID
    this.requestID = null;
    // モデルのロードが完了したら true
    this.loadLive2DCompleted = false;
    // モデルの初期化が完了したら true
    this.initLive2DCompleted = false;
    // WebGL Image型オブジェクトの配列
    this.loadedImages = [];
    // Live2D モデル設定。
    this.modelDef = {
        "type":"Live2D Model Setting",
        "name":"miku",
        "model":"assets/miku/miku.moc",
        "textures":[
            "assets/miku/miku.2048/texture_00.png",
        ]
    };

    // Live2Dの初期化
    Live2D.init();
    // canvasオブジェクトを取得
    can = document.getElementById(CAN_ID);
    can.width = can.height = CAN_SIZE;

    // コンテキストを失ったとき
    can.addEventListener("webglcontextlost", function(e) {
        Simple.myerror("context lost");
        loadLive2DCompleted = false;
        initLive2DCompleted = false;

        var cancelAnimationFrame =
            window.cancelAnimationFrame ||
            window.mozCancelAnimationFrame;
        cancelAnimationFrame(requestID); //アニメーションを停止

        e.preventDefault();
    }, false);

    // コンテキストが復元されたとき
    can.addEventListener("webglcontextrestored" , function(e){
        Simple.myerror("webglcontext restored");
        Simple.initLoop(can);
    }, false);

    // Init and start Loop
    Simple.initLoop(can);
};

/*
* WebGLコンテキストを取得・初期化。
* Live2Dの初期化、描画ループを開始。
*/
Simple.initLoop = function(can/*HTML5 canvasオブジェクト*/)
{
    //------------ WebGLの初期化 ------------

    // WebGLのコンテキストを取得する
    var para = {
        premultipliedAlpha : true,
//        alpha : false
    };
    gl = Simple.getWebGLContext(can, para);
    if (!gl) {
        Simple.myerror("Failed to create WebGL context.");
        return;
    }
    // イベント処理
    can.addEventListener('mousemove', mouseMove, true);
    can.addEventListener('mousewheel', mouseWheel, true);

    // 描画エリアを白でクリア
    gl.clearColor( 1.0 , 1.0 , 1.0 , 1.0 );

    //------------ Live2Dの初期化 ------------

    // mocファイルからLive2Dモデルのインスタンスを生成
    Simple.loadBytes(modelDef.model, function(buf){
        live2DModel = Live2DModelWebGL.loadModel(buf);
    });

    // テクスチャの読み込み
    var loadCount = 0;
    for(var i = 0; i < modelDef.textures.length; i++){
        (function ( tno ){// 即時関数で i の値を tno に固定する（onerror用)
            loadedImages[tno] = new Image();
            loadedImages[tno].src = modelDef.textures[tno];
            loadedImages[tno].onload = function(){
                if((++loadCount) == modelDef.textures.length) {
                    loadLive2DCompleted = true;//全て読み終わった
                }
            }
            loadedImages[tno].onerror = function() {
                Simple.myerror("Failed to load image : " + modelDef.textures[tno]);
            }
        })( i );
    }

    // フレームバッファ用の初期化処理
    Simple.Init_framebuffer();
    // VBOとIBOの初期化処理
    Simple.Init_vbo_ibo();

    //------------ 描画ループ ------------

    (function tick() {
        Simple.draw(gl); // 1回分描画

        var requestAnimationFrame =
            window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame;
        requestID = requestAnimationFrame( tick , can );// 一定時間後に自身を呼び出す
    })();
};

Simple.draw = function(gl/*WebGLコンテキスト*/)
{
    // Live2D初期化
    if( ! live2DModel || ! loadLive2DCompleted )
        return; //ロードが完了していないので何もしないで返る

    // ロード完了後に初回のみ初期化する
    if( ! initLive2DCompleted ){
        initLive2DCompleted = true;

        // 画像からWebGLテクスチャを生成し、モデルに登録
        for( var i = 0; i < loadedImages.length; i++ ){
            //Image型オブジェクトからテクスチャを生成
            var texName = Simple.createTexture(gl, loadedImages[i]);

            live2DModel.setTexture(i, texName); //モデルにテクスチャをセット
        }

        // テクスチャの元画像の参照をクリア
        loadedImages = null;

        // OpenGLのコンテキストをセット
        live2DModel.setGL(gl);

        // 表示位置を指定するための行列を定義する
        var s = 2.0 / live2DModel.getCanvasWidth(); //canvasの横幅を-1..1区間に収める
        var matrix4x4 = [
            s, 0, 0, 0,
            0,-s, 0, 0,
            0, 0, 1, 0,
           -1, 1, 0, 1
        ];
        live2DModel.setMatrix(matrix4x4);
    }

    // キャラクターのパラメータを適当に更新
    var t = UtSystem.getTimeMSec() * 0.001 * 2 * Math.PI; //1秒ごとに2π(1周期)増える
    var cycle = 3.0; //パラメータが一周する時間(秒)
    // PARAM_ANGLE_Xのパラメータが[cycle]秒ごとに-30から30まで変化する
    live2DModel.setParamFloat("PARAM_ANGLE_X", 30 * Math.sin(t/cycle));

    // ビュー×プロジェクション座標変換行列
    this.m.lookAt([0.0, 0.0, 2.5], [0, 0, 0], [0, 1, 0], this.vMatrix);
    this.m.perspective(45, CAN_SIZE / CAN_SIZE, 0.1, 100, this.pMatrix);
    this.m.multiply(this.pMatrix, this.vMatrix, this.tmpMatrix);


    // フレームバッファをバインドする
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbuffer[0].framebuffer);
    // canvasを初期化
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Live2Dモデルを更新して描画
    live2DModel.update(); // 現在のパラメータに合わせて頂点等を計算
    live2DModel.draw();   // 描画


    // フレームバッファのバインドを解除
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbuffer[1].framebuffer);
    // canvasを初期化
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // ステンシルバッファの初期化
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    // ステンシルテストを有効にする
    gl.enable(gl.STENCIL_TEST);
    //------------ マスクする円描画 ------------//
    // stencilFunc(定数, ref, mask)
    gl.stencilFunc(gl.ALWAYS, 1, ~0);
    // stencilOp(引数1:Stencil=NG
    //           引数2:Stencil=OK&depth=NG
    //           引数3:Stencil=OK&Depth=OK )
    gl.stencilOp(gl.KEEP, gl.REPLACE, gl.REPLACE);
    // シェーダー切り替え
    gl.useProgram(this.circle_prg);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // 円の描画
    Simple.draw_circle();

    //------------ 表示する画像の描画 ------------//
    // フレームバッファのテクスチャをバインド
    gl.bindTexture(gl.TEXTURE_2D, ftexture[0]);
    // シェーダー切り替え
    gl.useProgram(this.off_prg);
    // VBOとIBOの登録
    Simple.set_attribute(this.VBOList, this.attLocation, this.attStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndex);
    // stencilFunc(定数, ref, mask)
    gl.stencilFunc(gl.EQUAL, 1, ~0);
    // stencilOp(引数1:Stencil=NG
    //           引数2:Stencil=OK&depth=NG
    //           引数3:Stencil=OK&Depth=OK )
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    // uniform変数にテクスチャを登録
    gl.uniform1i(this.uniLocation[1], 0);
    // モデル座標変換行列の生成
    this.m.identity(this.mMatrix);
    // 行列の掛け合わせ
    this.m.multiply(this.tmpMatrix, this.mMatrix, this.mvpMatrix);
    gl.uniformMatrix4fv(this.uniLocation[0], false, this.mvpMatrix);
    // uniform変数の登録と描画
    gl.drawElements(gl.TRIANGLES, this.index.length, gl.UNSIGNED_SHORT, 0);
    // ステンシルテストを無効にする
    gl.disable(gl.STENCIL_TEST);

    // フレームバッファのバインドを解除
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // フレームバッファのテクスチャをバインド
    gl.bindTexture(gl.TEXTURE_2D, ftexture[1]);
    // canvasを初期化
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // モデル座標変換行列の生成
    this.m.identity(this.mMatrix);
    this.m.multiply(this.tmpMatrix, this.mMatrix, this.mvpMatrix);
    // uniform変数の登録と描画
    gl.uniformMatrix4fv(this.uniLocation[0], false, this.mvpMatrix);
    gl.drawElements(gl.TRIANGLES, this.index.length, gl.UNSIGNED_SHORT, 0);
};

/*
* WebGLのコンテキストを取得する
*/
Simple.getWebGLContext = function(can/*HTML5 canvasオブジェクト*/)
{
    var NAMES = [ "webgl" , "experimental-webgl" , "webkit-3d" , "moz-webgl"];

    var param = {
        alpha : true,
        premultipliedAlpha : true,
        stencil : true,
    };

    for( var i = 0; i < NAMES.length; i++ ){
        try{
            var ctx = can.getContext( NAMES[i], param );
            if( ctx ) return ctx;
        }
        catch(e){}
    }
    return null;
};


/*
* Image型オブジェクトからテクスチャを生成
*/
Simple.createTexture = function(gl/*WebGLコンテキスト*/, image/*WebGL Image*/)
{
    var texture = gl.createTexture(); //テクスチャオブジェクトを作成する
    if ( !texture ){
        mylog("Failed to generate gl texture name.");
        return -1;
    }

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);    //imageを上下反転
    gl.activeTexture( gl.TEXTURE0 );
    gl.bindTexture( gl.TEXTURE_2D , texture );
    gl.texImage2D( gl.TEXTURE_2D , 0 , gl.RGBA , gl.RGBA , gl.UNSIGNED_BYTE , image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture( gl.TEXTURE_2D , null );

    return texture;
};

/*
* ファイルをバイト配列としてロードする
*/
Simple.loadBytes = function(path , callback)
{
    var request = new XMLHttpRequest();
    request.open("GET", path , true);
    request.responseType = "arraybuffer";
    request.onload = function(){
        switch( request.status ){
        case 200:
            callback( request.response );
            break;
        default:
            Simple.myerror( "Failed to load (" + request.status + ") : " + path );
            break;
        }
    }
    request.send(null);
};

/*
* 画面ログを出力
*/
Simple.mylog = function(msg/*string*/)
{
    var myconsole = document.getElementById("myconsole");
    myconsole.innerHTML = myconsole.innerHTML + "<br>" + msg;
    console.log(msg);
};

/*
* 画面エラーを出力
*/
Simple.myerror = function(msg/*string*/)
{
    console.error(msg);
    Simple.mylog( "<span style='color:red'>" + msg + "</span>");
};

/*
* フレームバッファの初期化処理
*/
Simple.Init_framebuffer = function()
{
    // 頂点シェーダとフラグメントシェーダの生成
    var off_v_shader = Simple.create_shader('vs');
    var off_f_shader = Simple.create_shader('fs');
    var circle_v_shader = Simple.create_shader('circle_vs');
    var circle_f_shader = Simple.create_shader('circle_fs');
    // プログラムオブジェクトの生成とリンク
    this.off_prg = Simple.create_program(off_v_shader, off_f_shader, 0, true);
    this.circle_prg = Simple.create_program(circle_v_shader, circle_f_shader, 1, false);
    // 深度テストを有効にする
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
    // フレームバッファを生成
    fbuffer[0] = Simple.create_framebuffer(CAN_SIZE, CAN_SIZE, 0, false);
    fbuffer[1] = Simple.create_framebuffer(CAN_SIZE, CAN_SIZE, 1, true);
};

/*
* VBOとIBOの初期化処理
*/
Simple.Init_vbo_ibo = function()
{
    // attributeLocationを配列に取得
    this.attLocation = new Array();
    this.attLocation[0] = gl.getAttribLocation(this.off_prg, 'position');
    this.attLocation[1] = gl.getAttribLocation(this.off_prg, 'color');
    this.attLocation[2] = gl.getAttribLocation(this.off_prg, 'textureCoord');
    this.circle_attLoc = gl.getAttribLocation(this.circle_prg, 'position');
    // attributeの要素数を配列に格納
    this.attStride = new Array();
    this.attStride[0] = 3;
    this.attStride[1] = 4;
    this.attStride[2] = 2;
    // xyzの3要素
    this.circle_attSt = 3;
    // 頂点の位置
    this.position = [
        -1.0,  1.0,  0.0,
         1.0,  1.0,  0.0,
        -1.0, -1.0,  0.0,
         1.0, -1.0,  0.0
    ];
    // 頂点色
    this.color = [
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0
    ];
    // テクスチャ座標
    this.textureCoord = [
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        1.0, 1.0
    ];
    // 頂点インデックス
    this.index = [
        0, 1, 2,
        3, 2, 1
    ];
    // 頂点データ（円）
    this.circle_pos = [];
    // 頂点インデックス（円）
    this.circle_ind = [];

    // VBOとIBOの生成
    var vPosition     = Simple.create_vbo(this.position);
    var vColor        = Simple.create_vbo(this.color);
    var vTextureCoord = Simple.create_vbo(this.textureCoord);
    this.VBOList      = [vPosition, vColor, vTextureCoord];
    this.iIndex        = Simple.create_ibo(this.index);
    // VBOとIBOの登録
    Simple.set_attribute(this.VBOList, this.attLocation, this.attStride);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndex);
    // uniformLocationを配列に取得
    this.uniLocation = new Array();
    this.uniLocation[0]  = gl.getUniformLocation(this.off_prg, 'mvpMatrix');
    this.uniLocation[1]  = gl.getUniformLocation(this.off_prg, 'texture');

    // 各種行列の生成と初期化
    this.m = new matIV();
    this.mMatrix   = this.m.identity(this.m.create());
    this.vMatrix   = this.m.identity(this.m.create());
    this.pMatrix   = this.m.identity(this.m.create());
    this.tmpMatrix = this.m.identity(this.m.create());
    this.mvpMatrix = this.m.identity(this.m.create());
};

/*
* シェーダーコンパイル
*/
Simple.create_shader = function(id)
{
    // シェーダを格納する変数
    var shader;
    // HTMLからscriptタグへの参照を取得
    var scriptElement = document.getElementById(id);
    // scriptタグが存在しない場合は抜ける
    if(!scriptElement){return;}
    // scriptタグのtype属性をチェック
    switch(scriptElement.type){
        // 頂点シェーダの場合
        case 'x-shader/x-vertex':
            shader = gl.createShader(gl.VERTEX_SHADER);
            break;
        // フラグメントシェーダの場合
        case 'x-shader/x-fragment':
            shader = gl.createShader(gl.FRAGMENT_SHADER);
            break;
        default :
            return;
    }
    // 生成されたシェーダにソースを割り当てる
    gl.shaderSource(shader, scriptElement.text);
    // シェーダをコンパイルする
    gl.compileShader(shader);
    // シェーダが正しくコンパイルされたかチェック
    if(gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        // 成功していたらシェーダを返して終了
        return shader;
    }else{
        // 失敗していたらエラーログをアラートする
        alert(gl.getShaderInfoLog(shader));
    }
};

/*
 * プログラムオブジェクトを生成しシェーダをリンクする関数
 */
Simple.create_program = function(vs, fs, index, link){
    // プログラムオブジェクトの生成
    program[index] = gl.createProgram();
    // プログラムオブジェクトにシェーダを割り当てる
    gl.attachShader(program[index], vs);
    gl.attachShader(program[index], fs);
    // シェーダをリンク
    gl.linkProgram(program[index]);
    // シェーダのリンクが正しく行なわれたかチェック
    if(gl.getProgramParameter(program[index], gl.LINK_STATUS)){
        if(link == true){
            // 成功していたらプログラムオブジェクトを有効にする
            gl.useProgram(program[index]);
        }
        // プログラムオブジェクトを返して終了
        return program[index];
    }else{
        // 失敗していたらエラーログをアラートする
        alert(gl.getProgramInfoLog(program[index]));
    }
};

/*
 * VBOを生成する関数
 */
Simple.create_vbo = function(data){
    // バッファオブジェクトの生成
    var vbo = gl.createBuffer();
    // バッファをバインドする
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // バッファにデータをセット
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // 生成した VBO を返して終了
    return vbo;
};

/*
 * VBOをバインドし登録する関数
 */
Simple.set_attribute = function(vbo, attL, attS){
    // 引数として受け取った配列を処理する
    for(var i in vbo){
        // バッファをバインドする
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo[i]);
        // attributeLocationを有効にする
        gl.enableVertexAttribArray(attL[i]);
        // attributeLocationを通知し登録する
        gl.vertexAttribPointer(attL[i], attS[i], gl.FLOAT, false, 0, 0);
    }
};

/*
 * IBOを生成する関数
 */
Simple.create_ibo = function(data){
    // バッファオブジェクトの生成
    var ibo = gl.createBuffer();
    // バッファをバインドする
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // バッファにデータをセット
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Int16Array(data), gl.STATIC_DRAW);
    // バッファのバインドを無効化
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // 生成したIBOを返して終了
    return ibo;
};

/*
 * フレームバッファを生成する
 */
Simple.create_framebuffer = function(width, height, index, stencil){
    // フレームバッファオブジェクトの生成
    var framebuffer = gl.createFramebuffer();
    // フレームバッファをバインドする
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    // レンダーバッファオブジェクトの生成
    var depthrenderbuffer = gl.createRenderbuffer();
    // レンダーバッファをバインドする
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthrenderbuffer);
    if(stencil == false){
        // レンダーバッファのフォーマット設定
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        // フレームバッファへの深度バッファの関連付ける
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthrenderbuffer);
    }else{
        // レンダーバッファのフォーマット設定
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, width, height);
        // フレームバッファへの深度バッファの関連付ける
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthrenderbuffer);
    }

    // テクスチャオブジェクトの生成
    var frametexture = gl.createTexture();
    // テクスチャをバインドする
    gl.bindTexture(gl.TEXTURE_2D, frametexture);
    // テクスチャへイメージを適用
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // テクスチャパラメーター
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // フレームバッファにテクスチャを関連付ける
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frametexture, 0);
    // テクスチャのバインドを無効化
    gl.bindTexture(gl.TEXTURE_2D, null);
    // レンダーバッファのバインドを無効化
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    // フレームバッファのバインドを無効化
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 生成したテクスチャをグローバル変数に代入
    ftexture[index] = frametexture;
    // 返り値
    return {framebuffer: framebuffer, depthrenderbuffer: depthrenderbuffer, texture:ftexture[index]};
};

Simple.draw_circle = function(){
    var angle = 10;     // 角度
    var countup = 0;
    // 9の倍数が3頂点目、10度ずつ作る
    for(var i = 0; i<9*draw_angle; i+=3){
        // 始点は(0,0,0)
        if(i == 0){
            this.circle_pos[i]   = (0.0 + pos_x) * draw_scale;
            this.circle_pos[i+1] = (0.0 + pos_y) * draw_scale;
            this.circle_pos[i+2] = 0.0;
        // 三角形の2点目、3点目はこっち
        }else{
            this.circle_pos[i] = (Math.Cos(Math.PI / 180 * angle) + pos_x) * draw_scale;
            this.circle_pos[i+1] = (Math.Sin(Math.PI / 180 * angle)+ pos_y) * draw_scale;
            this.circle_pos[i+2] = 0.0;
            angle += 10;
        }
    }
    // 円のインデックス
    var index_nm = 0;
    for(var i = 0; i<3*draw_angle; i+=3){
        if(i == 0){
            this.circle_ind[i] = 0;
            this.circle_ind[i+1] = i+2;
            this.circle_ind[i+2] = i+1;
            index_nm = 3;
        }else{
            this.circle_ind[i] = 0;
            this.circle_ind[i+1] = index_nm;
            this.circle_ind[i+2] = index_nm - 1;
            index_nm++;
        }
    }

    // VBO生成
    var vbo = Simple.create_vbo(this.circle_pos);
    // IBO生成
    var ibo = Simple.create_ibo(this.circle_ind);
    // VBOバインド
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    // IBOバインド
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    // atribute属性を有効
    gl.enableVertexAttribArray(this.circle_attLoc);
    // attribute属性を登録
    gl.vertexAttribPointer(this.circle_attLoc, this.circle_attSt, gl.FLOAT, false, 0, 0);
    // uniformLocationの取得
    var circle_uniLoc = gl.getUniformLocation(this.circle_prg, 'mvpMatrix');
    // uniformLocationへ座標変換行列を登録
    gl.uniformMatrix4fv(circle_uniLoc, false, this.tmpMatrix);
    // モデル描画
    gl.drawElements(gl.TRIANGLES, this.circle_ind.length, gl.UNSIGNED_SHORT, 0);
};
