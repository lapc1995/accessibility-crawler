import Wappalyzer from 'wappalyzer-core';
import * as path from 'path';
import * as fs from 'fs';

const promiseTimeout = async (
    promise,
    fallback,
    errorMessage = 'Operation took too long to complete',
    maxWait = Math.min(100000, 10000)
  ) => {
    let timeout = null
  
    if (!(promise instanceof Promise)) {
      return Promise.resolve(promise)
    }
  
    return Promise.race([
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          clearTimeout(timeout)
  
          const error = new Error(errorMessage)
  
          error.code = 'PROMISE_TIMEOUT_ERROR'
  
          if (fallback !== undefined) {
            console.log(error)
  
            resolve(fallback)
          } else {
            reject(error)
          }
        }, maxWait)
      }),
      promise.then((value) => {
        clearTimeout(timeout)
  
        return value
      }),
    ])
  }


  function getDom(page, technologies = Wappalyzer.technologies) {
    return page.evaluate((technologies) => {
      return technologies
        .filter(({ dom }) => dom && dom.constructor === Object)
        .reduce((technologies, { name, dom }) => {
          const toScalar = (value) =>
            typeof value === 'string' || typeof value === 'number'
              ? value
              : !!value
  
          Object.keys(dom).forEach((selector) => {
            let nodes = []
  
            try {
              nodes = document.querySelectorAll(selector)
            } catch (error) {
              // Continue
            }
  
            if (!nodes.length) {
              return
            }
  
            dom[selector].forEach(({ exists, text, properties, attributes }) => {
              nodes.forEach((node) => {
                if (
                  technologies.filter(({ name: _name }) => _name === name)
                    .length >= 50
                ) {
                  return
                }
  
                if (
                  exists &&
                  technologies.findIndex(
                    ({ name: _name, selector: _selector, exists }) =>
                      name === _name && selector === _selector && exists === ''
                  ) === -1
                ) {
                  technologies.push({
                    name,
                    selector,
                    exists: '',
                  })
                }
  
                if (text) {
                  // eslint-disable-next-line unicorn/prefer-text-content
                  const value = (
                    node.textContent ? node.textContent.trim() : ''
                  ).slice(0, 1000000)
  
                  if (
                    value &&
                    technologies.findIndex(
                      ({ name: _name, selector: _selector, text }) =>
                        name === _name && selector === _selector && text === value
                    ) === -1
                  ) {
                    technologies.push({
                      name,
                      selector,
                      text: value,
                    })
                  }
                }
  
                if (properties) {
                  Object.keys(properties).forEach((property) => {
                    if (
                      Object.prototype.hasOwnProperty.call(node, property) &&
                      technologies.findIndex(
                        ({
                          name: _name,
                          selector: _selector,
                          property: _property,
                          value,
                        }) =>
                          name === _name &&
                          selector === _selector &&
                          property === _property &&
                          value === toScalar(value)
                      ) === -1
                    ) {
                      const value = node[property]
  
                      if (typeof value !== 'undefined') {
                        technologies.push({
                          name,
                          selector,
                          property,
                          value: toScalar(value),
                        })
                      }
                    }
                  })
                }
  
                if (attributes) {
                  Object.keys(attributes).forEach((attribute) => {
                    if (
                      node.hasAttribute(attribute) &&
                      technologies.findIndex(
                        ({
                          name: _name,
                          selector: _selector,
                          attribute: _atrribute,
                          value,
                        }) =>
                          name === _name &&
                          selector === _selector &&
                          attribute === _atrribute &&
                          value === toScalar(value)
                      ) === -1
                    ) {
                      const value = node.getAttribute(attribute)
  
                      technologies.push({
                        name,
                        selector,
                        attribute,
                        value: toScalar(value),
                      })
                    }
                  })
                }
              })
            })
          })
  
          return technologies
        }, [])
    }, technologies)
  }

  function getJs(page, technologies = Wappalyzer.technologies) {
    return page.evaluate((technologies) => {
      return technologies
        .filter(({ js }) => Object.keys(js).length)
        .map(({ name, js }) => ({ name, chains: Object.keys(js) }))
        .reduce((technologies, { name, chains }) => {
          chains.forEach((chain) => {
            chain = chain.replace(/\[([^\]]+)\]/g, '.$1')
  
            const value = chain
              .split('.')
              .reduce(
                (value, method) =>
                  value &&
                  value instanceof Object &&
                  Object.prototype.hasOwnProperty.call(value, method)
                    ? value[method]
                    : '__UNDEFINED__',
                window
              )
  
            if (value !== '__UNDEFINED__') {
              technologies.push({
                name,
                chain,
                value:
                  typeof value === 'string' || typeof value === 'number'
                    ? value
                    : !!value,
              })
            }
          })
  
          return technologies
        }, [])
    }, technologies)
  }



export const getTechnologies = async(page , html) => {

    const categories = JSON.parse(
      fs.readFileSync(path.resolve(`./categories.json`))
    )
    
    let technologies = {}
    
    for (const index of Array(27).keys()) {
      const character = index ? String.fromCharCode(index + 96) : '_'
    
      technologies = {
        ...technologies,
        ...JSON.parse(
          fs.readFileSync(
            path.resolve(`./technologies/${character}.json`)
          )
        ),
      }
    }
    
    Wappalyzer.setTechnologies(technologies)
    Wappalyzer.setCategories(categories)
  
  
    let cookies = []
    try {
      cookies = (await page.cookies()).reduce(
        (cookies, { name, value }) => ({
          ...cookies,
          [name.toLowerCase()]: [value],
        }),
        {}
      )
  
      // Change Google Analytics 4 cookie from _ga_XXXXXXXXXX to _ga_*
      Object.keys(cookies).forEach((name) => {
        if (/_ga_[A-Z0-9]+/.test(name)) {
          cookies['_ga_*'] = cookies[name]
  
          delete cookies[name]
        }
      })
    } catch (error) {
      error.message += ` (${url})`
  
      console.log(error);
      throw error;
    }
  
  
    let [scriptSrc, scripts] = await promiseTimeout(
      (
        await promiseTimeout(
          page.evaluateHandle(() => {
            const nodes = Array.from(
              document.getElementsByTagName('script')
            )
  
            return [
              nodes
                .filter(
                  ({ src }) =>
                    src && !src.startsWith('data:text/javascript;')
                )
                .map(({ src }) => src),
              nodes
                .map((node) => node.textContent)
                .filter((script) => script),
            ]
          }),
          { jsonValue: () => [] },
          'Timeout (scripts)'
        )
      ).jsonValue(),
      [],
      'Timeout (scripts)'
    )
  
    let meta = await promiseTimeout(
      (
        await promiseTimeout(
          page.evaluateHandle(() =>
            Array.from(document.querySelectorAll('meta')).reduce(
              (metas, meta) => {
                const key =
                  meta.getAttribute('name') || meta.getAttribute('property')
  
                if (key) {
                  metas[key.toLowerCase()] = metas[key.toLowerCase()] || []
  
                  metas[key.toLowerCase()].push(
                    meta.getAttribute('content')
                  )
                }
  
                return metas
              },
              {}
            )
          ),
          { jsonValue: () => [] },
          'Timeout (meta)'
        )
      ).jsonValue(),
      [],
      'Timeout (meta)'
    )
  
    let links = await promiseTimeout(
                (
                  await promiseTimeout(
                    page.evaluateHandle(() =>
                      Array.from(document.getElementsByTagName('a')).map(
                        ({ hash, hostname, href, pathname, protocol, rel }) => ({
                          hash,
                          hostname,
                          href,
                          pathname,
                          protocol,
                          rel,
                        })
                      )
                    ),
                    { jsonValue: () => [] },
                    'Timeout (links)'
                  )
                ).jsonValue(),
                [],
                'Timeout (links)'
              );
  
  
    let text = await promiseTimeout(
      (
        await promiseTimeout(
          page.evaluateHandle(
            () =>
              // eslint-disable-next-line unicorn/prefer-text-content
              document.body && document.body.innerText
          ),
          { jsonValue: () => '' },
          'Timeout (text)'
        )
      ).jsonValue(),
      '',
      'Timeout (text)'
    )
  
    let css = await promiseTimeout(
      (
        await promiseTimeout(
          page.evaluateHandle((maxRows) => {
            const css = []
  
            try {
              if (!document.styleSheets.length) {
                return ''
              }
  
              for (const sheet of Array.from(document.styleSheets)) {
                for (const rules of Array.from(sheet.cssRules)) {
                  css.push(rules.cssText)
  
                  if (css.length >= maxRows) {
                    break
                  }
                }
              }
            } catch (error) {
              return ''
            }
  
            return css.join('\n')
          }, 9999),
          { jsonValue: () => '' },
          'Timeout (css)'
        )
      ).jsonValue(),
      '',
      'Timeout (css)'
    )
    
    //js
    let js = await promiseTimeout(getJs(page), [], 'Timeout (js)')
    //console.log(js, js.length);
    const resultJs = await analyzeJs(js);
    //console.log("analyzeJs", resultJs.length);
  
    // DOM
    let dom = await promiseTimeout(getDom(page), [], 'Timeout (dom)')
    //console.log(dom, dom.length);
    const resultDom = await analyzeDom(dom);
    //console.log("analyzeDom", resultDom.length);
  
  
    
    //console.log("certIssuer", certIssuer);
    //console.log("headers", headers);
    //console.log("xhr", xhr);
  
    var detections = await Wappalyzer.analyze({
      url: await page.url(),
      meta, //{ generator: ['WordPress'] },
      headers,
      scripts,
      scriptSrc: scriptSrc,//['jquery-3.0.0.js'],
      cookies, //{ awselb: [''] },
      html,
      links,
      text,
      css,
      certIssuer,
      xhr,
    });
    //const results = Wappalyzer.resolve(detections)
  
    let detections2 = [detections, resultDom, resultJs].flat();
  
    detections2 = detections2.filter(
      (
        { technology: { name }, pattern: { regex }, version },
        index,
        detections2
      ) =>
        detections2.findIndex(
          ({
            technology: { name: _name },
            pattern: { regex: _regex },
            version: _version,
          }) =>
            name === _name &&
            version === _version &&
            (!regex || regex.toString() === _regex.toString())
        ) === index
    )
  
  
    const r = detections2;
    const rr =  Wappalyzer.resolve(detections2);
  
    //console.log(r.length)
    //console.log(rr.length)
  
    return rr;
  }

  const analyzeDom = async (dom, technologies = Wappalyzer.technologies) => {
    return dom
      .map(({ name, selector, exists, text, property, attribute, value }) => {
        const technology = technologies.find(({ name: _name }) => name === _name)
  
        if (typeof exists !== 'undefined') {
          return Wappalyzer.analyzeManyToMany(technology, 'dom.exists', {
            [selector]: [''],
          })
        }
  
        if (typeof text !== 'undefined') {
          return Wappalyzer.analyzeManyToMany(technology, 'dom.text', {
            [selector]: [text],
          })
        }
  
        if (typeof property !== 'undefined') {
          return Wappalyzer.analyzeManyToMany(technology, `dom.properties.${property}`, {
            [selector]: [value],
          })
        }
  
        if (typeof attribute !== 'undefined') {
          return Wappalyzer.analyzeManyToMany(technology, `dom.attributes.${attribute}`, {
            [selector]: [value],
          })
        }
      })
      .flat()
  }

  const analyzeJs = (js, technologies = Wappalyzer.technologies) => {
    return js
      .map(({ name, chain, value }) => {
        return Wappalyzer.analyzeManyToMany(
          technologies.find(({ name: _name }) => name === _name),
          'js',
          { [chain]: [value] }
        )
      })
      .flat()
  }


let certIssuer = [];
let headers;

export const analyzeHeader = (response, url) => {
    let tempHeaders = {};

    const rawHeaders = response.headers()
    Object.keys(rawHeaders).forEach((key) => {
      tempHeaders[key] = [
        ...(tempHeaders[key] || []),
        ...(Array.isArray(rawHeaders[key])
          ? rawHeaders[key]
          : [rawHeaders[key]]),
      ]
    })

    
    // Prevent cross-domain redirects
    if (response.status() >= 300 && response.status() < 400) {
      if (tempHeaders.location) {
        const _url = new URL(tempHeaders.location.slice(-1), url)
        const originalUrl = new URL(url);

        if (
          _url.hostname.replace(/^www\./, '') ===
            originalUrl.hostname.replace(/^www\./, '')
        ) {
          //url = _url

          return
        }
      }
    }

    const currentCertIssuer  = response.securityDetails()
    ? response.securityDetails().issuer()
    : null;

    if(currentCertIssuer && !certIssuer.includes(currentCertIssuer)){
      certIssuer.push(currentCertIssuer);
    }

     headers = tempHeaders;
  }

  const xhr = [];
  const xhrDebounce = [];

  export const analyseRequest = async (request, url) => { 

    try {

      url = new URL(url);

      if (request.resourceType() === 'xhr') {
        let hostname

        try {
          ;({ hostname } = new URL(request.url()))
        } catch (error) {
          request.abort('blockedbyclient')

          return
        }

        if (!xhrDebounce.includes(hostname)) {
          xhrDebounce.push(hostname)

          setTimeout(async () => {
            xhrDebounce.splice(xhrDebounce.indexOf(hostname), 1)

            xhr[url.hostname] =
              xhr[url.hostname] || []

            if (!xhr[url.hostname].includes(hostname)) {
              xhr[url.hostname].push(hostname)
            }
          }, 1000)
        }
      }
    } catch (error) {
      console.log(error);
    }
  }


