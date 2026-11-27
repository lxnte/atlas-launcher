//! Minimal parser for Valve's text KeyValues (.vdf / .acf) files.

#[derive(Debug, Clone)]
pub enum Vdf {
    Str(String),
    Obj(Vec<(String, Vdf)>),
}

impl Vdf {
    /// Case-insensitive child lookup.
    pub fn get(&self, key: &str) -> Option<&Vdf> {
        match self {
            Vdf::Obj(v) => v.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn path(&self, keys: &[&str]) -> Option<&Vdf> {
        let mut cur = self;
        for k in keys {
            cur = cur.get(k)?;
        }
        Some(cur)
    }
    pub fn str(&self) -> Option<&str> {
        match self {
            Vdf::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(|v| v.str())
    }
    pub fn entries(&self) -> &[(String, Vdf)] {
        match self {
            Vdf::Obj(v) => v,
            _ => &[],
        }
    }
}

enum Tok {
    S(String),
    Open,
    Close,
}

fn tokenize(text: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut it = text.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '{' => out.push(Tok::Open),
            '}' => out.push(Tok::Close),
            '"' => {
                let mut s = String::new();
                while let Some(c) = it.next() {
                    match c {
                        '"' => break,
                        '\\' => match it.next() {
                            Some('n') => s.push('\n'),
                            Some('t') => s.push('\t'),
                            Some(o) => s.push(o),
                            None => break,
                        },
                        o => s.push(o),
                    }
                }
                out.push(Tok::S(s));
            }
            '/' if it.peek() == Some(&'/') => {
                for c in it.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            c if c.is_whitespace() => {}
            c => {
                let mut s = String::from(c);
                while let Some(&n) = it.peek() {
                    if n.is_whitespace() || n == '{' || n == '}' || n == '"' {
                        break;
                    }
                    s.push(n);
                    it.next();
                }
                out.push(Tok::S(s));
            }
        }
    }
    out
}

fn parse_obj(t: &[Tok], i: &mut usize) -> Vec<(String, Vdf)> {
    let mut v = Vec::new();
    while *i < t.len() {
        match &t[*i] {
            Tok::Close => {
                *i += 1;
                break;
            }
            Tok::Open => *i += 1,
            Tok::S(k) => {
                let key = k.clone();
                *i += 1;
                match t.get(*i) {
                    Some(Tok::Open) => {
                        *i += 1;
                        v.push((key, Vdf::Obj(parse_obj(t, i))));
                    }
                    Some(Tok::S(val)) => {
                        v.push((key, Vdf::Str(val.clone())));
                        *i += 1;
                    }
                    _ => break,
                }
            }
        }
    }
    v
}

pub fn parse(text: &str) -> Vdf {
    let toks = tokenize(text);
    let mut i = 0;
    Vdf::Obj(parse_obj(&toks, &mut i))
}
