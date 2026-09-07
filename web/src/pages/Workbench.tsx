export function Workbench() {
  return (
    <main className="workbench">
      <aside className="pane" aria-label="项目与文件">
        <div className="pane-head">项目</div>
        <div className="pane-body">
          <section className="section">
            <h3>项目</h3>
            <p className="hint">还没有项目。绑定一个本地目录后，文件树会出现在这里。</p>
          </section>
          <section className="section">
            <h3>会话</h3>
            <p className="hint">对话记录会列在这里，可搜索、置顶、归档。</p>
          </section>
          <section className="section">
            <h3>文件</h3>
            <p className="hint">打开绑定目录后可浏览文件。</p>
          </section>
          <section className="section">
            <h3>知识</h3>
            <p className="hint">上传 MD / TXT / PDF 后可在对话里 @知识。</p>
          </section>
        </div>
      </aside>
      <section className="pane" aria-label="对话">
        <div className="pane-head">对话</div>
        <div className="chat-log">
          <p className="hint">从这里开始：写周报、读文档提问、或起草方案。引用文件请用 @。</p>
        </div>
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <textarea name="prompt" placeholder="输入消息，用 @ 引用文件、知识或规则" />
          <button className="btn btn-primary" type="submit">
            发送
          </button>
        </form>
      </section>
      <section className="pane" aria-label="画布">
        <div className="pane-head">画布</div>
        <div className="canvas-empty">打开文件后在这里编辑。AI 给出的代码改动会先出 diff，确认后再写盘。</div>
      </section>
    </main>
  );
}
