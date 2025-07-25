#ifndef __FR_H
#define __FR_H

#include <gmp.h>
#include <stdlib.h>
#include <sstream>
#include <string.h>
#include <assert.h>

#define Fr_N64 1
#define Fr_prime 18446744069414584321ull // 2**64 - 2**32 + 1
#define Fr_prime_str "18446744069414584321"
#define Fr_half 9223372034707292160ull // 2**64 - 2**32 + 1
// phi = 2**32, phi**2 - phi + 1
// uint32_t ticks32_auto = (uint32_t) ticks64;

#define Fr_copy(r, a) r = a

/*
void to_mpz(const uint64_t & a, mpz_t ma) {
  uint32_t a0 = (uint32_t)a;
  uint32_t a1 = (uint32_t)(a >> 32);
  mpz_set_ui(ma, a1);
  mpz_mul_2exp(ma, ma, 32);
  mpz_add_ui(ma, ma, a0);
}

uint64_t from_mpz(mpz_t ma) {
  uint32_t a0 = mpz_get_ui(ma);
  mpz_tdiv_q_2exp(ma,ma,32);
  uint32_t a1 = mpz_get_ui(ma);
  //mpz_clear(ma);
  uint64_t a = (uint64_t)a1 << 32;
  a += (uint64_t)a0;
  return a;
}
*/

inline void Fr_copyn(uint64_t r[], const uint64_t a[], int n){
  for (int i = 0; i < n; i++) {
    r[i] = a[i];
  }
}

inline int Fr_toInt(const uint64_t & a) {
  if (a > Fr_half) return -((int)(Fr_prime - a));
  return (int)a;
}

inline uint64_t Fr_str2element(const char *s, uint base) {
  return strtoull(s, NULL, base);
}

inline std::string Fr_element2str(const uint64_t & a) {
  std::stringstream ss;
  ss << a;
  return ss.str();
}

//inline uint64_t Fr_add_r (const uint64_t & a, const uint64_t & b) {
inline uint64_t Fr_add (const uint64_t & a, const uint64_t & b) {
  if (a <= Fr_half) {
    if (b > Fr_half) {
      uint64_t bn = Fr_prime - b;
      if (bn <= a) return a - bn; // is in [0..Fr_prime)
    }
    return a + b; // in the remaining cases a + b < Fr_prime
  } else {
    uint64_t an = Fr_prime - a; // an <= half
    if (an > b) return a + b;   // b <= half and a + b < Fr_prime
    return b - an; // is in [0..Fr_prime)  
  }
}

/*
inline uint64_t Fr_add (const uint64_t & a, const uint64_t & b) {
  uint64_t res = Fr_add_r(a,b);
  mpz_t ma;
  mpz_init(ma);
  to_mpz(a, ma);
  mpz_t mb;
  mpz_init(mb);
  to_mpz(b, mb);
  mpz_t mpz_prime;
  mpz_init_set_str(mpz_prime, Fr_prime_str, 10);
  mpz_t mr;
  mpz_init(mr);
  mpz_add(mr,ma,mb);
  mpz_mod(mr, mr, mpz_prime);
  uint64_t mres = from_mpz(mr);
  if (res != mres) {
    std::cout << a << " + " << b << " == " << res << " != " << mres << std::endl;
  }
  assert(res == mres);
  mpz_clear(ma);
  mpz_clear(mb);
  mpz_clear(mr);
  mpz_clear(mpz_prime);
  return res;
}
*/

//inline uint64_t Fr_sub_r (const uint64_t & a, const uint64_t & b) {
inline uint64_t Fr_sub (const uint64_t & a, const uint64_t & b) {
  return (b <= a)? a - b : Fr_prime - (b - a); 
}

/*
inline uint64_t Fr_sub (const uint64_t & a, const uint64_t & b) {
  uint64_t res = Fr_sub_r(a,b);
  mpz_t ma;
  mpz_init(ma);
  to_mpz(a, ma);
  mpz_t mb;
  mpz_init(mb);
  to_mpz(b, mb);
  mpz_t mpz_prime;
  mpz_init_set_str(mpz_prime, Fr_prime_str, 10);
  mpz_t mr;
  mpz_init(mr);
  mpz_sub(mr,ma,mb);
  mpz_mod(mr, mr, mpz_prime);
  uint64_t mres = from_mpz(mr);
  if (res != mres) {
    std::cout << a << " - " << b << " == " << res << " != " << mres << std::endl;
  }
  assert(res == mres);
  mpz_clear(ma);
  mpz_clear(mb);
  mpz_clear(mr);
  mpz_clear(mpz_prime);
  return res;
}
*/

//Assume prime is in (2**64, 2^64 - 2^33 + 1 )
//For instance goldilocks 2^64 - 2^32 + 1
//Multiplying 2 32 bits number is below 2^64 - 2^33 + 1, hence below prime
//inline uint64_t Fr_mul_r(const uint64_t & a, const uint64_t & b) {
inline uint64_t Fr_mul(const uint64_t & a, const uint64_t & b) {
  uint64_t a0 = (uint32_t)a;
  uint64_t a1 = a >> 32;
  // a = a1*2^32 + a0
  uint64_t b0 = (uint32_t)b;
  uint64_t b1 = b >> 32;
  // b = b1*2^32 + b0
  //std::cout << "a0: " << a0 << "; a1: " << a1 << std::endl;
  //std::cout << "b0: " << b0 << "; b1: " << b1 << std::endl;
  uint64_t a0b0 = (a0 * b0); //by assumption below prime
  uint64_t a0b1 = (a0 * b1); //by assumption below prime
  uint64_t a1b0 = (a1 * b0); //by assumption below prime
  uint64_t a1b1 = (a1 * b1); //by assumption below prime
  //std::cout << "a0b0: " << a0b0 << "; a0b1: " << a0b1 << std::endl;
  //std::cout << "a1b0: " << a1b0 << "; a1b1: " << a1b1 << std::endl;
  // res = a1b1*2**64 + (a1b0 + a0b1)*2**32 + a0b0
  // res = (a1b1 + a1b0 + a0b1)*2**32 + (a0b0-a1b1)
  uint64_t res32 = Fr_add(Fr_add(a1b1,a1b0),a0b1);
  uint64_t res0 = Fr_sub(a0b0,a1b1);
  //std::cout << "res32: " << res32 << std::endl;
  //std::cout << "res0: " << res0 << std::endl;
  uint64_t res32_0 = (uint32_t)res32;
  uint64_t res32_1 = res32 >> 32;
  //std::cout << "res32_0: " << res32_0 << std::endl;
  //std::cout << "res32_1: " << res32_1 << std::endl;
  // res32*2**32 = res32_1*2**64 + res32_0*2**32
  // res32*2**32 = (res32_1*2**32  + res32_0*2**32) - res32_1
  uint64_t res32_1_aux = res32_1 << 32;
  res32_0 <<= 32;
  uint64_t aux = Fr_sub(Fr_add(res32_1_aux,res32_0),res32_1);
  //std::cout << "aux: " << aux << std::endl;
  uint64_t res = Fr_add(aux,res0);
  //std::cout << a << " * " << b << " = " << res << std::endl;
  return res;
}

/*
inline uint64_t Fr_mul (const uint64_t & a, const uint64_t & b) {
  uint64_t res = Fr_mul_r(a,b);
  mpz_t ma;
  mpz_init(ma);
  to_mpz(a, ma);
  mpz_t mb;
  mpz_init(mb);
  to_mpz(b, mb);
  mpz_t mpz_prime;
  mpz_init_set_str(mpz_prime, Fr_prime_str, 10);
  mpz_t mr;
  mpz_init(mr);
  mpz_mul(mr,ma,mb);
  mpz_mod(mr, mr, mpz_prime);
  uint64_t mres = from_mpz(mr);
  if (res != mres) {
    std::cout << a << " * " << b << " == " << res << " != " << mres << std::endl;
  }
  assert(res == mres);
  mpz_clear(ma);
  mpz_clear(mb);
  mpz_clear(mr);
  mpz_clear(mpz_prime);
  return res;
}
*/

inline uint64_t Fr_inv(const uint64_t & a) {
  uint32_t a0 = (uint32_t)a;
  uint32_t a1 = (uint32_t)(a >> 32);
  mpz_t ma;
  mpz_init_set_ui(ma, a1);
  mpz_mul_2exp(ma, ma, 32);
  mpz_add_ui(ma, ma, a0);
  mpz_t mr;
  mpz_init(mr);
  mpz_t mpz_prime;
  mpz_init_set_str(mpz_prime, Fr_prime_str, 10);
  mpz_invert(mr, ma, mpz_prime);
  a0 = mpz_get_ui(mr);
  mpz_tdiv_q_2exp(mr,mr,32);
  a1 = mpz_get_ui(mr);
  mpz_clear(ma);
  mpz_clear(mr);
  mpz_clear(mpz_prime);
  uint64_t ra = (uint64_t)a1 << 32;
  ra += (uint64_t)a0;
  //std::cout << " inv " << a << " = " << ra << std::endl;
  return ra;
}

inline uint64_t Fr_div(const uint64_t & a, const uint64_t & b) {
  uint64_t ib = Fr_inv(b);
  return Fr_mul(a,ib);
}

inline uint64_t Fr_idiv(const uint64_t & a, const uint64_t & b) {
  return a / b;
}

inline uint64_t Fr_mod(const uint64_t & a, const uint64_t & b) {
  return a % b;
}

inline uint64_t Fr_pow(const uint64_t & a, const uint64_t & b) {
  uint64_t p = 1;
  uint64_t ao = a;
  uint64_t bo = b;
  while (bo>0) {
    if (bo%2 == 0)  {
      ao = Fr_mul(ao,ao);
      bo = bo / 2;
    } else {
      p = Fr_mul(p,ao);
      bo = bo - 1;
    }
  }
  return p;
}

uint64_t Fr_shr(const uint64_t & a, const uint64_t & b);

inline uint64_t Fr_shl(const uint64_t & a, const uint64_t & b) {
  if (b > Fr_half) return Fr_shr(a,Fr_prime-b);
  else {
    uint64_t s = a << b;
    if (s >= Fr_prime) s -= Fr_prime;
    return s;
  }
}

inline uint64_t Fr_shr(const uint64_t & a, const uint64_t & b) {
  if (b > Fr_half) return Fr_shl(a,Fr_prime-b);
  else return a >> b;
}

inline uint64_t Fr_leq(const uint64_t & a, const uint64_t & b) {
  if (a <= Fr_half) {
    if (b <= Fr_half) return a <= b;
    else return 0;
  } else {
    if (b <= Fr_half) return 1;
    else return a <= b;
  }    
}

inline uint64_t Fr_geq(const uint64_t & a, const uint64_t & b) {
  if (a <= Fr_half) {
    if (b <= Fr_half) return a >= b;
    else return 1;
  } else {
    if (b <= Fr_half) return 0;
    else return a >= b;
  }
}

inline uint64_t Fr_lt(const uint64_t & a, const uint64_t & b) {
  if (a <= Fr_half) {
    if (b <= Fr_half) return a < b;
    else return 0;
  } else {
    if (b <= Fr_half) return 1;
    else return a < b;
  }    
}

inline uint64_t Fr_gt(const uint64_t & a, const uint64_t & b) {
  if (a <= Fr_half) {
    if (b <= Fr_half) return a > b;
    else return 1;
  } else {
    if (b <= Fr_half) return 0;
    else return a > b;
  }
}

inline uint64_t Fr_eq(const uint64_t & a, const uint64_t & b) {
  return a == b;
}

inline uint64_t Fr_eq(const uint64_t a[], const uint64_t b[], int n) {
  for (int i = 0; i < n; i++) {
    if (a[i] != b[i]) return 0;
  }
  return 1;
}

inline uint64_t Fr_neq(const uint64_t & a, const uint64_t & b) {
  return a != b;
}

inline uint64_t Fr_lor(const uint64_t & a, const uint64_t & b) {
  return (a == 0) && (b ==0)? 0 : 1; 
}

inline uint64_t Fr_land(const uint64_t & a, const uint64_t & b) {
  return (a == 0) || (b ==0)? 0 : 1; 
}

inline uint64_t Fr_bor(const uint64_t & a, const uint64_t & b) {
  uint64_t bor = a | b;
  return bor < Fr_prime ? bor : bor - Fr_prime;
}

inline uint64_t Fr_band(const uint64_t & a, const uint64_t & b) {
  return a & b;
}

inline uint64_t Fr_bxor(const uint64_t & a, const uint64_t & b) {
  uint64_t bxor = a^b;
  return bxor < Fr_prime ? bxor : bxor - Fr_prime;
}

inline uint64_t Fr_neg(const uint64_t & a) {
  return Fr_prime - a;
}

inline uint64_t Fr_lnot(const uint64_t & a) {
  return a == 0? 1 : 0;
}

inline int Fr_isTrue(const uint64_t & a) {
  return a == 0? 0 : 1;
}

 inline uint64_t Fr_bnot(const uint64_t & a) {
  uint64_t bnot = ~a;
  return bnot < Fr_prime ? bnot : bnot - Fr_prime; 
}


#endif // __FR_H


