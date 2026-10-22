<?xml version="1.0" encoding="UTF-8"?>
<!-- Shown only when a browser opens feed.xml; feed reader apps ignore it. ASCII only. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
<xsl:output method="html" encoding="UTF-8" indent="no"/>
<xsl:template match="/">
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Headlines feed | The African Street Journal</title>
<style>
body{margin:0;background:#131313;color:#e8e6e3;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:720px;margin:0 auto;padding:28px 16px 64px}
.top a{color:#8f8a83;text-decoration:none;font-weight:600;font-size:14px}
h1{font:700 30px/1.15 Georgia,"Times New Roman",serif;margin:18px 0 10px}
.note{color:#a8a39d;margin:0 0 8px}
.note a{color:#66bb6a}
code{font:14px/1.4 ui-monospace,Consolas,monospace;color:#e8e6e3;word-break:break-all}
ol{list-style:none;padding:0;margin:24px 0 0}
li{padding:14px 0;border-bottom:1px solid #2a2a2a}
li a{color:#e8e6e3;text-decoration:none;font-weight:650;font-size:17px;line-height:1.4}
li a:hover,li a:focus-visible{color:#66bb6a}
li p{margin:4px 0 0;color:#a8a39d;font-size:15px}
li small{display:block;margin-top:4px;color:#8f8a83;font-size:13px}
</style>
</head>
<body>
<div class="wrap">
<p class="top"><a href="/">The African Street Journal</a></p>
<h1>Latest headlines</h1>
<p class="note">This page is our RSS feed. To follow it using very little data, add <code>https://africanstreetjournal.com/feed.xml</code> to a news reader app such as Feedly, Inoreader or NetNewsWire, and new headlines arrive as they are published.</p>
<p class="note">Reading in the browser? The <a href="/countries/">text-only edition</a> has the latest story from every country.</p>
<ol>
<xsl:for-each select="rss/channel/item">
<li>
<a href="{link}"><xsl:value-of select="title"/></a>
<p><xsl:value-of select="description"/></p>
<small><xsl:value-of select="category"/><xsl:if test="pubDate"> &#183; <xsl:value-of select="substring(pubDate, 1, 16)"/></xsl:if></small>
</li>
</xsl:for-each>
</ol>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
