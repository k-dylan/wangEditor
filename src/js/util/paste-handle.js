/*
    粘贴信息的处理
*/

import $ from './dom-core.js'
import { replaceHtmlSymbol } from './util.js'
import { objForEach } from './util.js'

// 获取粘贴的纯文本
export function getPasteText(e) {
    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData)
    let pasteText
    if (clipboardData == null) {
        pasteText = window.clipboardData && window.clipboardData.getData('text')
    } else {
        pasteText = clipboardData.getData('text/plain')
    }

    return replaceHtmlSymbol(pasteText)
}

// 获取粘贴的html
export function getPasteHtml(e, filterStyle, ignoreImg, editor) {
    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData)
    let pasteText, pasteHtml
    if (clipboardData == null) {
        pasteText = window.clipboardData && window.clipboardData.getData('text')
    } else {
        pasteText = clipboardData.getData('text/plain')
        pasteHtml = clipboardData.getData('text/html')
    }
    if (!pasteHtml && pasteText) {
        pasteHtml = '<p>' + replaceHtmlSymbol(pasteText) + '</p>'
    }
    if (!pasteHtml) {
        return
    }

    // 过滤word中状态过来的无用字符
    // const docSplitHtml = pasteHtml.split('</html>')
    // if (docSplitHtml.length === 2) {
    //     pasteHtml = docSplitHtml[0]
    // }

    const isWord = isWordInput(pasteHtml)
    if (isWord) {
        pasteHtml = clearWordRedundanceTags(pasteHtml)
    } else {
        // 过滤无用标签
        pasteHtml = pasteHtml.replace(/<(meta|script|link).+?>/igm, '')
        // 去掉注释
        pasteHtml = pasteHtml.replace(/<!--.*?-->/mg, '')
        // 过滤 data-xxx 属性
        pasteHtml = pasteHtml.replace(/\s?data-.+?=('|").+?('|")/igm, '')
    }

    if (ignoreImg) {
        // 忽略图片
        pasteHtml = pasteHtml.replace(/<img.+?>/igm, '')
    } else {
        // 检测如果是从word中复制的是否存在图片
        const mat = pasteHtml.match(/<img width=\d+? height=\d+?[\s\S]+?src="(\S+?)"/g)
        if(mat !== null) {
            let imgs = extractImageDataFromRtf(clipboardData.getData('text/rtf'))
            imgs.forEach((item, index) => {
                editor.uploadImg.uploadImg([dataURItoFile(item)], uploadWordImgDone(mat[index]))
            })
        }
    }

    if (filterStyle) {
        // 过滤样式
        pasteHtml = pasteHtml.replace(/\s?(class|style)=('|").*?('|")/igm, '')
    } else {
        // 保留样式
        pasteHtml = pasteHtml.replace(/\s?class=('|").*?('|")/igm, '')
    }

    return pasteHtml
}

// 获取粘贴的图片文件
export function getPasteImgs(e) {
    const result = []
    const txt = getPasteText(e)
    if (txt) {
        // 有文字，就忽略图片
        return result
    }

    const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData) || {}
    const items = clipboardData.items
    if (!items) {
        return result
    }

    objForEach(items, (key, value) => {
        const type = value.type
        if (/image/i.test(type)) {
            result.push(value.getAsFile())
        }
    })

    return result
}

/**
 * 从rtf数据中取出图片信息
 */
function extractImageDataFromRtf(rtfData) {
    if (!rtfData) {
        return []
    }

    const regexPictureHeader = /{\\pict[\s\S]+?\\bliptag-?\d+(\\blipupi-?\d+)?({\\\*\\blipuid\s?[\da-fA-F]+)?[\s}]*?/
    const regexPicture = new RegExp('(?:(' + regexPictureHeader.source + '))([\\da-fA-F\\s]+)\\}', 'g')
    const images = rtfData.match(regexPicture)
    const result = []

    if (images) {
        for (const image of images) {
            let imageType = false

            if (image.includes('\\pngblip')) {
                imageType = 'image/png'
            } else if (image.includes('\\jpegblip')) {
                imageType = 'image/jpeg'
            }

            if (imageType) {
                result.push({
                    hex: image.replace(regexPictureHeader, '').replace(/[^\da-fA-F]/g, ''),
                    type: imageType
                })
            }
        }
    }

    return result
}

/**
 * 将图片hex转换为base64
 */
function _convertHexToBase64(hexString) {
    return btoa(hexString.match(/\w{2}/g).map(char => {
        return String.fromCharCode(parseInt(char, 16))
    }).join(''))
}

const typeMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg'
}

/**
 * 将图片hex对象转换为File对象
 */
function dataURItoFile(img, fileName) {
    var byteString = atob(_convertHexToBase64(img.hex))
    var ab = new ArrayBuffer(byteString.length)
    var ia = new Uint8Array(ab)
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
    }
    return new File([ia], `image${typeMap[img.type]}`, {type: img.type, lastModified: Date.now()})
}

/**
 * word中图片上传完成以后，替换原有图片链接
 * @param {String} originalImg 原正则匹配到的图片标签
 */
function uploadWordImgDone (originalImg) {
    return (insertImg, result, editor) => {
        let url = result.data.url
        let imgsrc = originalImg.match(/src="(\S+)"/)
        if(imgsrc !== null) {
            let html = editor.txt.html()
            html = html.split(imgsrc[1]).join(url)
            editor.txt.html(html)
        }
    }
}
/**
 * 检查是否是从word中复制的
 */
function isWordInput( html ) {
	return !!( html && ( html.match( /<meta\s*name="?generator"?\s*content="?microsoft\s*word\s*\d+"?\/?>/gi ) ||
		html.match( /xmlns:o="urn:schemas-microsoft-com/gi ) ) );
}

/**
 * 删除word中的无用标签
 */
function clearWordRedundanceTags (html) {
    // 删除注释
    html = html.replace(/<!--[\s\S]*?-->/mg, '')
    // html = html.replace(/<head>[\s\S]*?<\/head>/mg, '')
    // html = html.replace(/<[html|body][\s\S]*?>/mg, '')
    // html = html.replace(/<\/[html|body]>/mg, '')
    return html
}