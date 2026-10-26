import AppKit
import WebKit

final class Smoke: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  var web: WKWebView!
  var window: NSWindow!
  func start(_ path: String) {
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "result")
    config.userContentController.add(self, name: "log")
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700), configuration: config)
    window = NSWindow(contentRect: NSRect(x: -10000, y: -10000, width: 900, height: 700), styleMask: [.titled, .closable], backing: .buffered, defer: false)
    window.title = "MarkEdit Prose — WebKit validation"
    window.contentView = web
    window.orderFront(nil)
    web.navigationDelegate = self
    web.loadFileURL(URL(fileURLWithPath: path), allowingReadAccessTo: URL(fileURLWithPath: path).deletingLastPathComponent().deletingLastPathComponent())
    DispatchQueue.main.asyncAfter(deadline: .now() + 45) { print("WebKit smoke test timed out"); exit(1) }
  }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    print(message.body)
    if message.name == "log" { return }
    if let body = message.body as? String, body.contains("\"ok\":true") { exit(0) }
    exit(1)
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { print(error); exit(1) }
}
let app = NSApplication.shared
let smoke = Smoke()
smoke.start(CommandLine.arguments[1])
app.run()
