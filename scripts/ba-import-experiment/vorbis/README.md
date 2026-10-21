# Vorbis setup headers

`setups.json` contains two base64-encoded Vorbis setup packets from
[HearthSim/python-fsb5's header table](https://github.com/HearthSim/python-fsb5/blob/master/fsb5/vorbis_headers.py),
under the adjacent MIT `LICENSE`. Copyright and permission notice are preserved.

The downloaded source table had SHA-256
`abb2a177ddad75d4c42f8c19ae20cd86be4145761ff40881136a13652dd3aa70`.
Only CRC keys `2365614477` and `2358607825` are included, for the reviewed mono
and stereo BA JP prologue samples. They describe codec setup, without game audio
packets. The experiment rejects other setup identifiers.

The remuxer follows the [Ogg framing specification](https://xiph.org/ogg/doc/framing.html)
and [Vorbis specification](https://xiph.org/vorbis/doc/Vorbis_I_spec.html).
It preserves the compressed audio packets and repackages them for browser decoding.
