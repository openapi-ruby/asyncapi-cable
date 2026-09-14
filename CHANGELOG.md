# Changelog

## [0.3.0](https://github.com/openapi-ruby/asyncapi-cable/compare/asyncapi-cable-v0.2.3...asyncapi-cable-v0.3.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* an enum is a union rather than a TypeScript `enum`, so `StatusEnum.STARTED` no longer resolves; use the literal `"started"`.

### Features

* generate models and a parser for a contentSchema payload ([#25](https://github.com/openapi-ruby/asyncapi-cable/issues/25)) ([273820d](https://github.com/openapi-ruby/asyncapi-cable/commit/273820df781efe1dc28122430aa20f511f681f4c))
* make the union enum an option, and keep 0.x on minor bumps ([#28](https://github.com/openapi-ruby/asyncapi-cable/issues/28)) ([905c850](https://github.com/openapi-ruby/asyncapi-cable/commit/905c850dab4f59118c8ea5ef1a0002129d3967bc))


### Bug Fixes

* resolve renamed models, and emit enums as unions ([#27](https://github.com/openapi-ruby/asyncapi-cable/issues/27)) ([1276ecc](https://github.com/openapi-ruby/asyncapi-cable/commit/1276ecc70249796386ebf3822f36422cb2da3b08))

## [0.2.3](https://github.com/openapi-ruby/asyncapi-cable/compare/asyncapi-cable-v0.2.2...asyncapi-cable-v0.2.3) (2026-08-26)


### Bug Fixes

* **release:** publish the root package, and allow recovering a skipped publish ([#23](https://github.com/openapi-ruby/asyncapi-cable/issues/23)) ([25e7107](https://github.com/openapi-ruby/asyncapi-cable/commit/25e710704ffec6faf8e809dc0df5e5a07dee93f1))

## [0.2.2](https://github.com/openapi-ruby/asyncapi-cable/compare/asyncapi-cable-v0.2.1...asyncapi-cable-v0.2.2) (2026-08-26)


### Bug Fixes

* import the params type in a generated composable ([#21](https://github.com/openapi-ruby/asyncapi-cable/issues/21)) ([c9b3e2f](https://github.com/openapi-ruby/asyncapi-cable/commit/c9b3e2f5c3d1095f53b626b671bbf150fc9f20c9))

## [0.2.1](https://github.com/101skills-gmbh/asyncapi-cable/compare/asyncapi-cable-v0.2.0...asyncapi-cable-v0.2.1) (2026-07-31)


### Bug Fixes

* mark bin/cli.mjs executable ([58d57a6](https://github.com/101skills-gmbh/asyncapi-cable/commit/58d57a66eed7b0eecd1c443dcd2670550934f8cb))
* mark bin/cli.mjs executable ([02c5e58](https://github.com/101skills-gmbh/asyncapi-cable/commit/02c5e58dc3a3678cf6b64f7e3068d1e8fcaa81fb))

## [0.2.0](https://github.com/101skills-gmbh/asyncapi-cable/compare/asyncapi-cable-v0.1.0...asyncapi-cable-v0.2.0) (2026-07-31)


### Features

* accept an http(s) URL as the document input ([a88856c](https://github.com/101skills-gmbh/asyncapi-cable/commit/a88856c0e063751d5fe1c8af3eafa5add9dac7cb))
* accept an http(s) URL as the document input ([3c16959](https://github.com/101skills-gmbh/asyncapi-cable/commit/3c169591526691eb15997368067de2989ccd015b))
* asyncapi-cable — typed AnyCable client codegen from AsyncAPI 3.0 ([0195ed8](https://github.com/101skills-gmbh/asyncapi-cable/commit/0195ed86b26d8fbf4b8801918f77e86140a3b795))
